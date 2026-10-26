import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin from "../server.ts";
import { Store } from "./store.ts";

test("agent tools enforce project ownership", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "egm-tools-"));
  const db = new Database(":memory:");
  const tools = new Map<string, (params: Record<string, unknown>, context: { projectId: string; threadId: string }) => Promise<unknown>>();
  const schemas = new Map<string, { safeParse: (value: unknown) => { success: boolean } }>();
  let rpc: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  const bb = {
    settings: { define: () => ({ get: async () => ({ goldfishBaseUrl: "", goldfishModel: "", goldfishApiKey: "", goldfishApiKeyEnv: "", goldfishTimeoutSeconds: 30 }) }) },
    storage: { database: () => db, migrate: (_db: unknown, migrations: string[]) => migrations.forEach((sql) => db.exec(sql)) },
    sdk: { projects: { get: async () => ({ sources: [{ type: "local_path", path: root, isDefault: true }] }) } },
    realtime: { publish: () => {} }, log: { info: () => {}, warn: () => {} },
    rpc: { register: (_contract: unknown, handlers: typeof rpc) => { rpc = handlers; } },
    agents: { registerTool: (tool: { name: string; parameters: { safeParse: (value: unknown) => { success: boolean } }; execute: (params: Record<string, unknown>, context: { projectId: string; threadId: string }) => Promise<unknown> }) => { tools.set(tool.name, tool.execute); schemas.set(tool.name, tool.parameters); }, configure: () => {} },
    cli: { register: () => {} }, onDispose: () => {},
  };
  try {
    await fs.writeFile(path.join(root, "spec.md"), "# Spec\n");
    await plugin(bb as unknown as BbPluginApi);
    const store = new Store(db);
    store.insertSpec({ id: "spec-a", projectId: "a", path: "spec.md", title: "Spec", createdAt: 1 });
    store.insertRun({ id: "run-a", specId: "spec-a", projectId: "a", preset: "implementation", round: 1, maxRounds: 1, state: "awaiting_decisions", stateReason: null, targetHash: "hash", context: [], threadId: "thread-a", parentRunId: null, reportDir: ".egm", createdAt: 1, finishedAt: null, stale: false });
    store.insertStage({ id: "stage-a", runId: "run-a", round: 1, position: 1, lens: "structural", standard: "feature-spec-standard", state: "completed", provider: null, error: null, reportPath: null, startedAt: null, finishedAt: null });
    store.insertFinding({ id: "finding-a", runId: "run-a", stageId: "stage-a", round: 1, lens: "structural", severity: "major", rawSeverity: "major", title: "Finding", body: "Body", lineStart: null, lineEnd: null, state: "open", decision: null, elephantNote: null, proposalId: null, createdAt: 1 }, "spec-a");
    const proposeSchema = schemas.get("egm_propose")!;
    const proposalParams = { specId: "spec-a", findingIds: ["finding-a"], content: "# Updated spec\n", summary: "Change" };
    assert.equal(proposeSchema.safeParse(proposalParams).success, true);
    assert.equal(proposeSchema.safeParse({ ...proposalParams, findingIds: [] }).success, true);
    assert.deepEqual(store.listProposals("spec-a"), []);
    const foreign = { projectId: "b", threadId: "thread-b" };
    for (const [name, params] of [
      ["egm_start_review", { specId: "spec-a", preset: "implementation", context: [], maxRounds: 1 }],
      ["egm_review_status", { specId: "spec-a" }],
      ["egm_contest", { findingId: "finding-a", rationale: "No" }],
      ["egm_propose", { specId: "spec-a", findingIds: ["finding-a"], content: "# Changed", summary: "Change" }],
    ] as const) {
      const result = await tools.get(name)!(params, foreign) as { isError?: boolean };
      assert.equal(result.isError, true, name);
    }
    assert.equal(store.getFinding("finding-a")?.elephantNote, null);
    assert.equal(store.listProposals("spec-a").length, 0);
    const status = await tools.get("egm_review_status")!({ specId: "spec-a" }, { projectId: "a", threadId: "thread-a" });
    assert.equal(typeof status, "string");
    const proposed = JSON.parse(await tools.get("egm_propose")!({ specId: "spec-a", findingIds: ["finding-a"], content: "# Updated spec\n", summary: "Change" }, { projectId: "a", threadId: "thread-a" }) as string) as { id: string; baseHash: string };
    const target = path.join(root, "spec.md");
    const backup = path.join(root, "backup.md");
    const staged = path.join(root, "staged.md");
    await fs.writeFile(backup, "# Spec\n");
    await fs.writeFile(staged, "# Updated spec\n");
    store.putApplyIntent({ proposalId: proposed.id, targetPath: target, backupPath: backup, stagedPath: staged, baseHash: proposed.baseHash, resultHash: "result", createdAt: 1, operationId: "pending-forget" });
    await assert.rejects(async () => rpc.specs_forget!({ specId: "spec-a" }), /unfinished apply/);
    assert.ok(store.getSpec("spec-a"));
    assert.ok(store.getRun("run-a"));
    assert.equal(store.getProposal(proposed.id)!.state, "proposed");
    assert.equal(store.getFinding("finding-a")!.proposalId, proposed.id);
    assert.equal(store.listApplyIntents().length, 1);
    assert.equal(await fs.readFile(target, "utf8"), "# Spec\n");
    assert.equal(await fs.readFile(backup, "utf8"), "# Spec\n");
    assert.equal(await fs.readFile(staged, "utf8"), "# Updated spec\n");
    store.deleteApplyIntent(proposed.id);
    const applied = await rpc.proposal_apply!({ proposalId: proposed.id, baseHash: proposed.baseHash, opId: "rpc-apply" }) as { state: string; backupPath: string };
    assert.equal(applied.state, "applied");
    assert.equal(await fs.readFile(path.join(root, "spec.md"), "utf8"), "# Updated spec\n");
    assert.equal(await fs.readFile(applied.backupPath, "utf8"), "# Spec\n");
    assert.deepEqual(await rpc.specs_forget!({ specId: "spec-a" }), { removed: true });
    assert.equal(store.getSpec("spec-a"), null);
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("workspace search uses the thread checkout and returns confined files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "egm-search-"));
  const other = await fs.mkdtemp(path.join(os.tmpdir(), "egm-other-"));
  const db = new Database(":memory:");
  let rpc: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  let environment = { projectId: "a", hostId: "host", path: root, status: "ready" };
  let results = { paths: [
    { kind: "file", path: "notes.md" },
    { kind: "directory", path: "folder" },
    { kind: "file", path: "../outside.md" },
    { kind: "file", path: "escape.md" },
  ], truncated: true };
  let failSearch = false;
  const searches: unknown[] = [];
  const bb = {
    settings: { define: () => ({ get: async () => ({ goldfishBaseUrl: "", goldfishModel: "", goldfishApiKey: "", goldfishApiKeyEnv: "", goldfishTimeoutSeconds: 30 }) }) },
    storage: { database: () => db, migrate: (_db: unknown, migrations: string[]) => migrations.forEach((sql) => db.exec(sql)) },
    sdk: {
      projects: { get: async () => ({ sources: [{ type: "local_path", path: root, hostId: "host", isDefault: true }] }) },
      threads: { get: async ({ threadId }: { threadId: string }) => ({ projectId: "a", environmentId: threadId === "missing" ? null : "env" }) },
      environments: {
        get: async () => environment,
        paths: async (args: unknown) => { searches.push(args); if (failSearch) throw new Error("search failed"); return results; },
      },
    },
    realtime: { publish: () => {} }, log: { info: () => {}, warn: () => {} },
    rpc: { register: (_contract: unknown, handlers: typeof rpc) => { rpc = handlers; } },
    agents: { registerTool: () => {}, configure: () => {} }, cli: { register: () => {} }, onDispose: () => {},
  };
  try {
    await fs.writeFile(path.join(root, "notes.md"), "notes");
    await fs.writeFile(path.join(other, "outside.md"), "outside");
    await fs.symlink(path.join(other, "outside.md"), path.join(root, "escape.md"));
    await plugin(bb as unknown as BbPluginApi);
    assert.deepEqual(await rpc.workspace_search!({ threadId: "thread", query: "notes" }), { paths: ["notes.md"], truncated: true });
    assert.deepEqual(searches[0], { environmentId: "env", query: "notes", includeFiles: "true", includeDirectories: "false" });
    results = { paths: [], truncated: false };
    assert.deepEqual(await rpc.workspace_search!({ threadId: "thread", query: "none" }), { paths: [], truncated: false });
    await assert.rejects(rpc.workspace_search!({ threadId: "missing", query: "" }), /unavailable/);
    environment = { ...environment, path: other };
    await assert.rejects(rpc.workspace_search!({ threadId: "thread", query: "" }), /does not match/);
    environment = { ...environment, path: root, hostId: "remote" };
    await assert.rejects(rpc.workspace_search!({ threadId: "thread", query: "" }), /does not match/);
    environment = { ...environment, hostId: "host", projectId: "other" };
    await assert.rejects(rpc.workspace_search!({ threadId: "thread", query: "" }), /does not match/);
    environment = { ...environment, projectId: "a", status: "stopped" };
    await assert.rejects(rpc.workspace_search!({ threadId: "thread", query: "" }), /does not match/);
    assert.equal(searches.length, 2, "incompatible checkouts must not be searched");
    environment = { ...environment, status: "ready" };
    failSearch = true;
    await assert.rejects(rpc.workspace_search!({ threadId: "thread", query: "" }), /search failed/);
    assert.equal("elephant_request" in rpc, false);
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(other, { recursive: true, force: true });
  }
});
