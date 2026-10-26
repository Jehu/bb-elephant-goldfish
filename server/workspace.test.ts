import assert from "node:assert/strict";
import { promises as fs, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { WorkspaceError, compareAndReplace, planApply, readInside, reconcileApply, resolveInside, sha256 } from "./workspace.ts";

async function tempRoot(): Promise<string> {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "egm-ws-")));
}

test("resolveInside refuses traversal and symlinked escapes", async () => {
  const root = await tempRoot();
  const outside = await tempRoot();
  await fs.symlink(outside, path.join(root, "link"));
  await assert.rejects(resolveInside(root, "../x.md"), WorkspaceError);
  await assert.rejects(resolveInside(root, "/etc/passwd"), WorkspaceError);
  await assert.rejects(resolveInside(root, "link/x.md"), WorkspaceError);
  assert.equal(await resolveInside(root, "docs/x.md"), path.join(root, "docs/x.md"));
});

test("readInside refuses a symlinked file", async () => {
  const root = await tempRoot();
  await fs.writeFile(path.join(root, "real.md"), "x");
  await fs.symlink(path.join(root, "real.md"), path.join(root, "alias.md"));
  await assert.rejects(readInside(root, "alias.md"), /symbolic link/);
});

test("compareAndReplace writes the new content when the base still matches", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  await fs.writeFile(target, "old\n");
  const plan = planApply(target, "p1");
  let intent = false;
  const outcome = await compareAndReplace(plan, sha256("old\n"), "new\n", () => (intent = true));
  assert.equal(outcome.kind, "applied");
  assert.equal(intent, true);
  assert.equal(await fs.readFile(target, "utf8"), "new\n");
  assert.equal(await fs.readFile(plan.backupPath, "utf8"), "old\n");
  await assert.rejects(fs.access(plan.stagedPath));
});

test("compareAndReplace refuses a stale base and leaves the file untouched", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  await fs.writeFile(target, "edited by someone\n");
  const outcome = await compareAndReplace(planApply(target, "p1"), sha256("old\n"), "new\n", () => {
    throw new Error("must not reach the swap");
  });
  assert.equal(outcome.kind, "stale");
  assert.equal(await fs.readFile(target, "utf8"), "edited by someone\n");
});

test("an external write before the final check is kept and reported as a conflict", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  await fs.writeFile(target, "old\n");
  const plan = planApply(target, "p1");
  const outcome = await compareAndReplace(plan, sha256("old\n"), "new\n", () => {
    writeFileSync(target, "editor save\n");
  });
  assert.equal(outcome.kind, "conflict");
  assert.equal(await fs.readFile(target, "utf8"), "editor save\n");
  assert.equal(await fs.readFile(plan.backupPath, "utf8"), "old\n");
});

test("reconcileApply leaves the original in place when replacement was interrupted", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  const plan = planApply(target, "p1");
  await fs.writeFile(target, "old\n");
  await fs.writeFile(plan.backupPath, "old\n");
  await fs.writeFile(plan.stagedPath, "new\n");
  const result = await reconcileApply(plan, sha256("old\n"), sha256("new\n"));
  assert.equal(result.state, "not_applied");
  assert.equal(await fs.readFile(target, "utf8"), "old\n");
  await assert.rejects(fs.access(plan.stagedPath));
});

test("reconcileApply reports a finished apply as applied", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  const plan = planApply(target, "p1");
  await fs.writeFile(target, "new\n");
  await fs.writeFile(plan.backupPath, "old\n");
  assert.equal((await reconcileApply(plan, sha256("old\n"), sha256("new\n"))).state, "applied");
});

test("reconcileApply never guesses when the files match neither version", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  const plan = planApply(target, "p1");
  await fs.writeFile(target, "something else\n");
  await fs.writeFile(plan.backupPath, "old\n");
  assert.equal((await reconcileApply(plan, sha256("old\n"), sha256("new\n"))).state, "unknown");
  assert.equal(await fs.readFile(target, "utf8"), "something else\n");
});

test("reconcileApply does not restore a missing target from the backup", async () => {
  const root = await tempRoot();
  const target = path.join(root, "spec.md");
  const plan = planApply(target, "p1");
  await fs.writeFile(plan.backupPath, "old\n");
  assert.equal((await reconcileApply(plan, sha256("old\n"), sha256("new\n"))).state, "unknown");
  await assert.rejects(fs.access(target));
  assert.equal(await fs.readFile(plan.backupPath, "utf8"), "old\n");
});
