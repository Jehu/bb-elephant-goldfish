import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin from "../server.ts";
import { Engine, type ReviewEngine, type ReviewerCall } from "./engine.ts";
import { MIGRATIONS, Store } from "./store.ts";
import { specSchema, type Checkout } from "./contract.ts";
import { sha256 } from "./workspace.ts";
import { reviewGuidelines } from "./prompts.ts";

test("specs and confirmed apply stay in their worktree even when the author moves", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "egm-worktrees-")));
  const main = path.join(dir, "main");
  const a = path.join(dir, "a");
  const b = path.join(dir, "b");
  await fs.mkdir(main);
  const git = (...args: string[]) => execFileSync("git", ["-C", main, ...args], { stdio: "pipe" });
  git("init");
  await fs.writeFile(path.join(main, "spec.md"), "# Original\n");
  git("add", "spec.md");
  git("-c", "user.name=EGM Test", "-c", "user.email=egm@example.invalid", "commit", "-m", "Initial");
  git("worktree", "add", "-b", "a", a);
  git("worktree", "add", "-b", "b", b);
  const db = new Database(":memory:");
  const tools = new Map<string, (params: any, context: any) => Promise<any>>();
  let rpc: Record<string, (params: any) => Promise<any>> = {};
  const disposers: (() => void | Promise<void>)[] = [];
  let authorEnvironment = "a";
  let environmentFailure = false;
  let environmentMissing = false;
  const environments: { id: string; projectId: string; hostId: string; path: string | null; status: string; name: string }[] = [main, a, b].map((root, i) => ({ id: ["main", "a", "b"][i]!, projectId: "p", hostId: "host", path: root, status: "ready", name: path.basename(root) }));
  const bb = {
    pluginId: "elephant-goldfish",
    settings: { define: () => ({ get: async () => ({ reviewerEngine: "goldfish" }) }) },
    storage: { database: () => db, migrate: (_: unknown, statements: string[]) => db.transaction(() => statements.forEach(sql => db.exec(sql)))() },
    sdk: {
      projects: { get: async () => ({ sources: [{ type: "local_path", path: main, hostId: "host", isDefault: true }] }) },
      threads: { get: async ({ threadId }: { threadId: string }) => ({ projectId: "p", environmentId: threadId === "author" ? authorEnvironment : threadId }) },
      environments: { get: async ({ environmentId }: { environmentId: string }) => {
        if (environmentId === "a" && environmentFailure) throw new Error("Environment lookup temporarily failed");
        if (environmentId === "a" && environmentMissing) return undefined;
        return environments.find(e => e.id === environmentId);
      }, list: async () => environments, paths: async () => ({ paths: [{ kind: "file", path: "spec.md" }], truncated: false }) },
      files: { read: async ({ path: file }: { path: string }) => ({ content: await fs.readFile(file, "utf8"), contentEncoding: "utf8" }) },
    },
    realtime: { publish: () => {} }, log: { info: () => {}, warn: () => {} },
    rpc: { register: (_: unknown, handlers: typeof rpc) => { rpc = handlers; } },
    agents: { registerTool: (tool: { name: string; execute: any }) => tools.set(tool.name, tool.execute), configure: () => {} },
    cli: { register: () => {} }, onDispose: (fn: () => void | Promise<void>) => { disposers.push(fn); },
  };
  try {
    await plugin(bb as unknown as BbPluginApi);
    const call = async (name: string, params: unknown, threadId: string) => {
      const result = await tools.get(name)!(params, { projectId: "p", threadId });
      assert.equal(result?.isError, undefined, JSON.stringify(result));
      return JSON.parse(result);
    };
    const sa = await call("egm_register_spec", { path: "spec.md" }, "author");
    assert.equal(sa.checkout.root, a);
    const sb = await call("egm_register_spec", { path: "spec.md" }, "b");
    const sm = await call("egm_register_spec", { path: "spec.md" }, "main");
    assert.equal(new Set([sa.id, sb.id, sm.id]).size, 3);
    const store = new Store(db);
    for (const [spec, label] of [[sa, "A"], [sb, "B"]] as const) {
      store.insertRun({ id: `run-${label}`, specId: spec.id, projectId: "p", preset: "implementation", round: 1, maxRounds: 1,
        state: "completed", stateReason: null, targetHash: sha256("# Original\n"), context: [], threadId: null,
        engine: "goldfish", provider: null, model: null, parentRunId: null, reportDir: ".egm", createdAt: 1, finishedAt: 2, stale: false });
      store.insertStage({ id: `stage-${label}`, runId: `run-${label}`, round: 1, position: 0, lens: "structural", standard: "feature-spec-standard",
        state: "completed", engine: "goldfish", provider: null, model: null, workerThreadId: null, error: null, reportPath: null, startedAt: 1, finishedAt: 2 });
      store.insertFinding({ id: `finding-${label}`, runId: `run-${label}`, stageId: `stage-${label}`, round: 1, lens: "structural",
        severity: "major", rawSeverity: "major", title: `Policy ${label}`, body: `Facts ${label}`, lineStart: null, lineEnd: null,
        state: "accepted_tradeoff", decision: { kind: "accept_tradeoff", rationale: `Only checkout ${label}`, decidedBy: "human", decidedAt: 3 },
        elephantNote: null, proposalId: null, createdAt: 1 }, spec.id);
      store.setFindingDecision(`finding-${label}`, "accepted_tradeoff", { kind: "accept_tradeoff", rationale: `Only checkout ${label}`, decidedBy: "human", decidedAt: 3 });
      store.addEvent(spec.id, `run-${label}`, "context", `Missing ${label}`);
    }
    for (const [spec, thread, label] of [[sa, "a", "A"], [sb, "b", "B"]] as const) {
      const context = (await call("egm_review_status", { specId: spec.id }, thread)).reviewContext;
      assert.deepEqual(context.decisions.map((d: { rationale: string }) => d.rationale), [`Only checkout ${label}`]);
      assert.deepEqual(context.contextNotes, [`Missing ${label}`]);
    }
    assert.equal((await call("egm_register_spec", { path: "spec.md" }, "a")).id, sa.id);
    assert.deepEqual((await call("egm_specs", {}, "author")).specs.map((s: { id: string }) => s.id), [sa.id]);
    assert.equal((await rpc.workspace_search!({ threadId: "author", query: "spec" })).paths[0], "spec.md");
    const proposal = await call("egm_propose", { specId: sa.id, findingIds: [], content: "# Updated in A\n", summary: "Change A" }, "author");
    authorEnvironment = "b";
    const wrong = await tools.get("egm_propose")!({ specId: sa.id, findingIds: [], content: "# Wrong\n", summary: "Wrong checkout" }, { projectId: "p", threadId: "author" });
    assert.equal(wrong.isError, true);
    const applied = await rpc.proposal_apply!({ proposalId: proposal.id, baseHash: proposal.baseHash, opId: "apply-a" });
    assert.equal(applied.state, "applied");
    assert.equal(await fs.readFile(path.join(a, "spec.md"), "utf8"), "# Updated in A\n");
    for (const root of [main, b]) assert.equal(await fs.readFile(path.join(root, "spec.md"), "utf8"), "# Original\n");
    assert.equal((await rpc.spec_detail!({ specId: sa.id })).spec.checkout.root, a);
    environments.find(e => e.id === "a")!.path = b;
    const unavailable = await rpc.spec_detail!({ specId: sa.id });
    assert.match(unavailable.spec.workspaceError, /environment changed/);
    assert.equal(unavailable.spec.workspaceErrorCode, null);
    assert.equal(unavailable.content, null);
    assert.equal((await rpc.spec_detail!({ specId: sb.id })).content, "# Original\n");

    const envA = environments.find(e => e.id === "a")!;
    const history = { runs: unavailable.runs, stages: unavailable.stages, findings: unavailable.findings, proposals: unavailable.proposals };
    for (const scenario of [
      { status: "destroyed", path: null, projectId: "p", removed: true },
      { status: "error", path: null, projectId: "p", removed: false },
      { status: "ready", path: null, projectId: "p", removed: false },
      { status: "destroyed", path: null, projectId: "other", removed: false },
      { status: "ready", path: a, projectId: "p", removed: false, missing: true },
      { status: "ready", path: a, projectId: "p", removed: false, failure: true },
    ]) {
      Object.assign(envA, { status: scenario.status, path: scenario.path, projectId: scenario.projectId });
      environmentMissing = "missing" in scenario;
      environmentFailure = "failure" in scenario;
      const detail = await rpc.spec_detail!({ specId: sa.id });
      const listed = (await rpc.specs_list!({ projectId: "p" })).specs.find((s: { id: string }) => s.id === sa.id);
      for (const spec of [detail.spec, listed]) {
        assert.equal(specSchema.safeParse(spec).success, true);
        assert.equal(spec.workspaceErrorCode, scenario.removed ? "checkout_removed" : null);
        assert.ok(spec.workspaceError);
        assert.equal(spec.exists, false);
        assert.equal(spec.checkout.root, a, "unavailable checkouts must retain their original target");
      }
      assert.deepEqual({ runs: detail.runs, stages: detail.stages, findings: detail.findings, proposals: detail.proposals }, history);
    }
    environmentMissing = environmentFailure = false;
    Object.assign(envA, { status: "ready", path: a, projectId: "p" });
    const available = (await rpc.spec_detail!({ specId: sa.id })).spec;
    assert.equal(available.exists, true);
    assert.equal(available.workspaceErrorCode, null);
    const { workspaceErrorCode: _code, ...legacyShape } = available;
    assert.equal(specSchema.safeParse(legacyShape).success, true, "the additional code is optional for existing callers");
    await fs.rm(path.join(a, "spec.md"));
    const missingFile = (await rpc.spec_detail!({ specId: sa.id })).spec;
    assert.equal(missingFile.exists, false);
    assert.equal(missingFile.workspaceError, null);
    assert.equal(missingFile.workspaceErrorCode, null, "a missing file is not a removed checkout");
  } finally {
    for (const dispose of disposers.reverse()) await dispose();
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("checkout migration preserves references and requires explicit assignment for old specs", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "egm-migration-")));
  const db = new Database(":memory:");
  const split = MIGRATIONS.findIndex(sql => sql.includes("CREATE TABLE specs_with_checkouts"));
  for (const sql of MIGRATIONS.slice(0, split)) db.exec(sql);
  db.pragma("foreign_keys = ON");
  await fs.writeFile(path.join(root, "spec.md"), "# Original\n");
  db.exec(`
    INSERT INTO specs VALUES ('s', 'p', 'spec.md', 'Original', 1);
    INSERT INTO runs (id,spec_id,project_id,preset,round,max_rounds,state,target_hash,context_json,report_dir,created_at)
      VALUES ('r','s','p','implementation',1,3,'awaiting_decisions','base','[]','.egm/r',1);
    INSERT INTO stages (id,run_id,round,position,lens,standard,state) VALUES ('st','r',1,0,'structural','implementation-readiness-standard','completed');
    INSERT INTO findings (id,run_id,stage_id,spec_id,round,lens,severity,raw_severity,title,body,state,proposal_id,created_at)
      VALUES ('f','r','st','s',1,'structural','major','major','Gap','Details','proposal_pending','pr',1);
    INSERT INTO proposals (id,spec_id,run_id,finding_ids_json,base_hash,result_hash,result_content,diff,summary,author,state,created_at)
      VALUES ('pr','s','r','["f"]','base','result','# Change','diff','Summary','old-thread','proposed',1);
    INSERT INTO apply_intents (proposal_id,target_path,base_hash,result_hash,backup_path,staged_path,created_at)
      VALUES ('pr','/original/spec.md','base','result','/original/backup','/original/staged',1);
    INSERT INTO ad_hoc_review_tasks (proposal_id,target_hash,options_json,created_at)
      VALUES ('pr','result','{"preset":"full","context":[],"maxRounds":3,"threadId":"old-thread"}',1);
  `);
  try {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => MIGRATIONS.slice(split).forEach(sql => db.exec(sql)))();
    db.pragma("foreign_keys = ON");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    const store = new Store(db);
    assert.equal(store.getSpec("s")!.checkout, null);
    assert.equal(store.getRun("r")!.specId, "s");
    assert.equal(store.getFinding("f")!.proposalId, "pr");
    assert.equal(store.getProposal("pr")!.checkoutKey, null);
    assert.equal(store.listApplyIntents()[0]!.targetPath, "/original/spec.md");
    assert.equal(store.listPendingAdHocReviewTasks().length, 1);
    const reviewer: ReviewEngine = { engine: "goldfish", status: async () => ({ engine: "goldfish", ready: false, reason: "test", model: null, endpoint: null }), complete: async () => { throw new Error("no review expected"); } };
    const engine = new Engine({ store, goldfish: reviewer, threadProject: async () => "p", checkoutRoot: async (_p, checkout) => checkout.root, changed: () => {}, log: { info: () => {}, warn: () => {} } });
    const unbound = await engine.describeSpec(store.getSpec("s")!);
    assert.equal(unbound.content, null);
    assert.match(unbound.spec.workspaceError!, /explicit checkout assignment/);
    assert.equal(unbound.spec.workspaceErrorCode, null);
    assert.equal(store.getProposal("pr")!.state, "proposed", "reading an unbound spec preserves its old diff");
    const checkout = { hostId: "host", root, environmentId: "env" };
    await assert.rejects(engine.bindCheckout("s", checkout), /unfinished apply/);
    store.deleteApplyIntent("pr");
    await engine.bindCheckout("s", checkout);
    assert.equal(store.getSpec("s")!.checkout!.root, root);
    assert.equal(store.getProposal("pr")!.state, "stale");
    assert.equal(store.getFinding("f")!.state, "fix_requested");
    assert.equal(store.getRun("r")!.state, "stale");
    assert.equal(store.listPendingAdHocReviewTasks().length, 0);
    await assert.rejects(engine.applyProposal("pr", "base", "legacy"), /stale/);
    await assert.rejects(engine.bindCheckout("s", checkout), /already bound/);
    assert.equal(await fs.readFile(path.join(root, "spec.md"), "utf8"), "# Original\n");
  } finally { db.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test("review context, reports, automatic rounds and restart receipts stay in the spec checkout", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "egm-review-checkout-")));
  const a = path.join(dir, "a"); const b = path.join(dir, "b");
  for (const root of [a, b]) { await fs.mkdir(root); await fs.writeFile(path.join(root, "spec.md"), "# Original\n"); }
  await fs.writeFile(path.join(a, "context.md"), "Context from A");
  await fs.writeFile(path.join(b, "context.md"), "Context from B");
  const db = new Database(":memory:");
  for (const sql of MIGRATIONS) db.exec(sql);
  const store = new Store(db);
  store.grantReviewerConsent();
  const calls: { call: ReviewerCall; text: string }[] = [];
  const reviewer: ReviewEngine = {
    engine: "bb", status: async () => ({ engine: "bb", ready: true, reason: null, model: null, endpoint: null }),
    complete: async (messages, _signal, call) => {
      calls.push({ call, text: messages.map(m => m.content).join("\n") });
      return { ok: true, text: calls.length === 1 ? "### FINDING\nseverity: major\nlines: 1-1\ntitle: Gap\nA gap.\n" : "NO FINDINGS", model: "test", truncated: false };
    },
  };
  const checkout: Checkout = { hostId: "host", root: a, environmentId: "env-a" };
  let available = true;
  const deps = { store, goldfish: reviewer, reviewer: () => reviewer, currentReviewer: async () => ({ engine: "bb" as const, provider: null, model: null, environmentId: "env-b" }), threadProject: async () => "p", checkoutRoot: async (_p: string, bound: Checkout) => { if (!available) throw new Error("checkout unavailable"); return bound.root; }, changed: () => {}, log: { info: () => {}, warn: () => {} } };
  const engine = new Engine(deps);
  try {
    const spec = await engine.registerSpec("p", "spec.md", checkout);
    const run = await engine.startRun(spec.id, { preset: "custom", lenses: ["structural"], standard: "implementation-readiness-standard", context: ["context.md"], maxRounds: 3, threadId: "origin" });
    await engine.settle();
    assert.equal(store.getRun(run.id)!.environmentId, "env-a");
    assert.equal(calls[0]!.call.environmentId, "env-a");
    assert.match(calls[0]!.text, /Context from A/);
    assert.ok(calls[0]!.text.includes(reviewGuidelines));
    assert.doesNotMatch(calls[0]!.text, /Context from B/);
    assert.ok((await fs.readdir(path.join(a, run.reportDir))).includes("round-1"));
    await assert.rejects(fs.stat(path.join(b, ".egm")), /ENOENT/);
    deps.threadProject = async () => { throw new Error("Origin thread was deleted"); };
    const finding = store.listFindings(spec.id)[0]!;
    const proposal = await engine.propose(spec.id, [finding.id], "# Updated\n", "Change", "author");
    await engine.applyProposal(proposal.id, proposal.baseHash, "review-apply");
    await engine.settle();
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.call.environmentId, "env-a");
    const adhoc = await engine.propose(spec.id, [], "# Ad hoc\n", "Ad hoc", "moved-author");
    await engine.applyProposal(adhoc.id, adhoc.baseHash, "adhoc-apply");
    await engine.settle();
    assert.equal(calls.at(-1)!.call.environmentId, "env-a");
    assert.equal(await fs.readFile(path.join(b, "spec.md"), "utf8"), "# Original\n");
    const pending = await engine.propose(spec.id, [], "# Recovered\n", "Recover", "author");
    const target = path.join(a, "spec.md"); const backup = path.join(a, "backup");
    await fs.copyFile(target, backup);
    store.putApplyIntent({ proposalId: pending.id, targetPath: target, backupPath: backup, stagedPath: path.join(a, "staged"), baseHash: pending.baseHash, resultHash: sha256("# Recovered\n"), createdAt: Date.now(), operationId: "restart-apply", reviewer: { engine: "bb", provider: null, model: null, environmentId: "env-a" } });
    await fs.writeFile(target, "# Recovered\n");
    available = false;
    await new Engine(deps).reconcile();
    assert.equal(store.listApplyIntents().length, 1, "unavailable checkout keeps its recovery intent");
    available = true;
    const restarted = new Engine(deps);
    await restarted.reconcile(); await restarted.settle();
    assert.equal(store.getProposal(pending.id)!.state, "applied");
    assert.equal(store.listApplyIntents().length, 0);
    assert.equal((store.getOperation<{ state: string }>("restart-apply"))!.state, "applied");
    assert.equal(calls.at(-1)!.call.environmentId, "env-a");
    assert.equal(await fs.readFile(path.join(b, "spec.md"), "utf8"), "# Original\n");
    reviewer.complete = async () => {
      available = false;
      return { ok: true, text: "NO FINDINGS", model: "test", truncated: false };
    };
    const interrupted = await engine.startRun(spec.id, { preset: "custom", lenses: ["structural"], context: [], maxRounds: 1, threadId: null });
    await engine.settle();
    assert.equal(store.getRun(interrupted.id)!.state, "failed");
    assert.equal(store.listStages(interrupted.id)[0]!.state, "failed", "a lost checkout must not leave its stage running");
    await assert.rejects(fs.stat(path.join(b, interrupted.reportDir)), /ENOENT/);
  } finally { engine.dispose(); await engine.settle(); db.close(); await fs.rm(dir, { recursive: true, force: true }); }
});
