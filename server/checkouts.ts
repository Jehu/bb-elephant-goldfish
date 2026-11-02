import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Checkout } from "./contract.ts";
import { checkoutKey } from "./store.ts";
import { WorkspaceError } from "./workspace.ts";

/** Resolve only BB-owned environments; paths supplied by callers are never roots. */
export class Checkouts {
  private readonly bb: BbPluginApi;
  private probe: Promise<{ dir: string; file: string; token: string }> | undefined;
  private readonly localHosts = new Set<string>();

  constructor(bb: BbPluginApi) {
    this.bb = bb;
    bb.onDispose(async () => {
      if (this.probe) await fs.rm((await this.probe).dir, { recursive: true, force: true });
    });
  }

  private async requireLocal(hostId: string): Promise<void> {
    if (this.localHosts.has(hostId)) return;
    // The SDK has no server-host ID. A random local marker, read through the
    // explicit host API, proves filesystem locality without trusting equal paths.
    this.probe ??= (async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "egm-host-"));
      const file = path.join(dir, "identity");
      const token = randomUUID();
      await fs.writeFile(file, token, { mode: 0o600 });
      return { dir, file, token };
    })();
    const { file, token } = await this.probe;
    const result = await this.bb.sdk.files.read({ hostId, path: file }).catch(() => null);
    if (!result || result.contentEncoding !== "utf8" || result.content !== token) {
      throw new WorkspaceError("This checkout is not available on the BB server's machine. Remote spec files are not supported.");
    }
    this.localHosts.add(hostId);
  }

  async environment(projectId: string, environmentId: string): Promise<Checkout> {
    const env = await this.bb.sdk.environments.get({ environmentId });
    if (!env || env.projectId !== projectId) {
      throw new WorkspaceError("The checkout environment is unavailable or belongs to another project.");
    }
    if (env.status === "destroyed") {
      throw new WorkspaceError("The checkout environment was removed. Its saved review history is still available.", "checkout_removed");
    }
    if (env.status !== "ready" || !env.path) {
      throw new WorkspaceError("The checkout environment is unavailable or belongs to another project.");
    }
    await this.requireLocal(env.hostId);
    const root = await fs.realpath(env.path).catch(() => null);
    if (!root || !(await fs.stat(root)).isDirectory()) throw new WorkspaceError("The checkout directory is unavailable.");
    return { hostId: env.hostId, root, environmentId };
  }

  async thread(projectId: string, threadId: string): Promise<Checkout> {
    const thread = await this.bb.sdk.threads.get({ threadId });
    if (thread.projectId !== projectId) throw new WorkspaceError("Thread does not belong to this project.");
    if (!thread.environmentId) throw new WorkspaceError("Thread workspace is unavailable. Select an available checkout and retry.");
    return this.environment(projectId, thread.environmentId);
  }

  async validate(projectId: string, checkout: Checkout): Promise<string> {
    const current = await this.environment(projectId, checkout.environmentId);
    if (checkoutKey(current) !== checkoutKey(checkout)) {
      throw new WorkspaceError(`The checkout environment changed. This spec remains bound to ${checkout.root}.`);
    }
    return current.root;
  }

  async list(projectId: string): Promise<Checkout[]> {
    const out: Checkout[] = [];
    for (let offset = 0; ; offset += 100) {
      const environments = await this.bb.sdk.environments.list({ projectId, status: "ready", limit: 100, offset });
      for (const env of environments) {
        try {
          const checkout = await this.environment(projectId, env.id);
          if (!out.some(item => checkoutKey(item) === checkoutKey(checkout))) out.push(checkout);
        } catch { /* Unavailable hosts are not offered for new registrations. */ }
      }
      if (environments.length < 100) break;
    }
    return out;
  }
}
