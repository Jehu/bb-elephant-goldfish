// Confined workspace access and cooperative compare-and-replace. External
// writers are not excluded: an edit between the final check and rename can
// be overwritten. The preserved pre-image supports inspection and recovery.
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

export const sha256 = (content: string): string => createHash("sha256").update(content, "utf8").digest("hex");

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export class WorkspaceError extends Error {}

/**
 * Resolve a workspace-relative path to an absolute one inside `root`,
 * rejecting traversal and symlinks that escape the root.
 */
export async function resolveInside(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative)) throw new WorkspaceError(`path must be relative to the project: ${relative}`);
  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new WorkspaceError(`path leaves the project: ${relative}`);
  }
  const realRoot = await fs.realpath(root);
  const absolute = path.join(realRoot, normalized);
  // Resolve the deepest existing ancestor so a symlinked directory cannot lead out.
  let probe = absolute;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const rel = path.relative(realRoot, real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new WorkspaceError(`path resolves outside the project: ${relative}`);
      }
      break;
    } catch (cause) {
      if (cause instanceof WorkspaceError) throw cause;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return absolute;
}

export type FileRead = { content: string; hash: string } | { missing: true };

/** Read a regular file inside the root; symlinks and non-regular files are refused. */
export async function readInside(root: string, relative: string): Promise<FileRead> {
  const absolute = await resolveInside(root, relative);
  let stat;
  try {
    stat = await fs.lstat(absolute);
  } catch {
    return { missing: true };
  }
  if (stat.isSymbolicLink()) throw new WorkspaceError(`refusing to follow a symbolic link: ${relative}`);
  if (!stat.isFile()) throw new WorkspaceError(`not a regular file: ${relative}`);
  if (stat.size > MAX_FILE_BYTES) throw new WorkspaceError(`file is larger than 2 MB: ${relative}`);
  const content = await fs.readFile(absolute, "utf8");
  return { content, hash: sha256(content) };
}

export type ApplyOutcome =
  | { kind: "applied"; backupPath: string }
  | { kind: "stale"; reason: string }
  | { kind: "conflict"; reason: string; backupPath: string | null };

export type ApplyPlan = {
  targetPath: string;
  backupPath: string;
  stagedPath: string;
};

/** Paths for an apply, in the target's own directory for atomic rename. */
export function planApply(absoluteTarget: string, proposalId: string): ApplyPlan {
  const dir = path.dirname(absoluteTarget);
  const base = path.basename(absoluteTarget);
  const tag = `${proposalId}.${randomBytes(4).toString("hex")}`;
  return {
    targetPath: absoluteTarget,
    backupPath: path.join(dir, `.${base}.egm-pre-${tag}`),
    stagedPath: path.join(dir, `.${base}.egm-new-${tag}`),
  };
}

async function hashFile(file: string): Promise<string | null> {
  try {
    return sha256(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function syncDirectory(file: string): Promise<void> {
  const directory = await fs.open(path.dirname(file), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

/** Stage and preserve the pre-image before atomically replacing the target. */
export async function compareAndReplace(
  plan: ApplyPlan,
  baseHash: string,
  content: string,
  beforeSwap: () => void,
): Promise<ApplyOutcome> {
  const { targetPath, backupPath, stagedPath } = plan;
  const stat = await fs.lstat(targetPath).catch(() => null);
  if (stat === null) return { kind: "stale", reason: "the document no longer exists" };
  if (!stat.isFile() || stat.isSymbolicLink()) return { kind: "stale", reason: "the document is no longer a regular file" };
  if ((await hashFile(targetPath)) !== baseHash) return { kind: "stale", reason: "the document changed after this proposal was made" };

  let intentPersisted = false;
  let backupCreated = false;
  let stagedCreated = false;
  try {
    const handle = await fs.open(stagedPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, stat.mode & 0o777);
    stagedCreated = true;
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.copyFile(targetPath, backupPath, fsConstants.COPYFILE_EXCL);
    backupCreated = true;
    const backup = await fs.open(backupPath, "r");
    try { await backup.sync(); } finally { await backup.close(); }
    await syncDirectory(targetPath);
    if ((await hashFile(backupPath)) !== baseHash || (await hashFile(targetPath)) !== baseHash) {
      return { kind: "stale", reason: "the document changed while preparing the proposal" };
    }
    beforeSwap();
    intentPersisted = true;
    // Check again after persisting the intent; this narrows but cannot close
    // the race with non-cooperating external editors.
    const current = await fs.lstat(targetPath).catch(() => null);
    if (!current?.isFile() || current.isSymbolicLink() || (await hashFile(targetPath)) !== baseHash) {
      return { kind: "conflict", reason: "the document changed while applying the proposal; the pre-image was kept", backupPath };
    }
    await fs.rename(stagedPath, targetPath);
    await syncDirectory(targetPath);
    if ((await hashFile(targetPath)) !== sha256(content)) {
      return { kind: "conflict", reason: "the document changed right after apply; review it before continuing", backupPath };
    }
    return { kind: "applied", backupPath };
  } finally {
    if (stagedCreated) await fs.rm(stagedPath, { force: true });
    if (!intentPersisted && backupCreated) await fs.rm(backupPath, { force: true });
  }
}

/**
 * After a crash, decide what an unfinished apply left behind. Never
 * reapplies: it only reports what the files show.
 */
export async function reconcileApply(
  plan: ApplyPlan,
  baseHash: string,
  resultHash: string,
): Promise<{ state: "applied" | "not_applied" | "unknown"; reason: string }> {
  const target = await hashFile(plan.targetPath);
  const backup = await hashFile(plan.backupPath);
  await fs.rm(plan.stagedPath, { force: true });
  if (target === resultHash && backup === baseHash) {
    return { state: "applied", reason: "applied before the restart; verified from the files" };
  }
  if (target === baseHash && backup === null) {
    return { state: "not_applied", reason: "the restart interrupted the apply before the document was touched" };
  }
  if (target === baseHash && backup === baseHash) {
    return { state: "not_applied", reason: "the restart interrupted the apply before replacement; the pre-image was kept" };
  }
  return {
    state: "unknown",
    reason: "the restart interrupted the apply and the files match neither version; check the document and the kept pre-image",
  };
}

/** Write a plugin-owned report file (never a spec). Creates parent directories. */
export async function writeReport(root: string, relative: string, content: string): Promise<void> {
  const absolute = await resolveInside(root, relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const tmp = `${absolute}.tmp-${randomBytes(4).toString("hex")}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, absolute);
}
