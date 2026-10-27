import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { Engine, type ReviewEngine, type ReviewerCall, type ReviewerSnapshot } from "./engine.ts";
import { GoldfishClient } from "./goldfish.ts";
import { MIGRATIONS, Store } from "./store.ts";
import { sha256 } from "./workspace.ts";

/**
 * `gate`: the reply waits until the test opens it (and still honors abort).
 * `hang`: the reply waits until the request is aborted.
 */
type Reply = { content?: string; status?: number; body?: string; toolCall?: boolean; hang?: boolean; gate?: Promise<void> };

/**
 * OpenAI-compatible fake: answers queued replies and records each request body.
 * `requestCount(n)` resolves once n chat requests have reached it.
 */
function fakeEndpoint(replies: Reply[]) {
  const requests: { model: string; messages: { role: string; content: string }[]; tools?: unknown }[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith("/models")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    requests.push(JSON.parse(String(init?.body)));
    for (const w of waiters.filter((w) => requests.length >= w.n)) w.resolve();
    const reply = replies.shift() ?? { content: "NO FINDINGS" };
    if (reply.hang || reply.gate) {
      const aborted = Promise.withResolvers<never>();
      init?.signal?.addEventListener("abort", () => aborted.reject(new DOMException("aborted", "AbortError")));
      if (reply.hang) return aborted.promise;
      await Promise.race([reply.gate, aborted.promise]);
    }
    if (reply.status) return new Response(reply.body ?? "nope", { status: reply.status });
    const message = reply.toolCall
      ? { content: null, tool_calls: [{ id: "t", type: "function", function: { name: "write_file", arguments: "{}" } }] }
      : { content: reply.content };
    return new Response(
      JSON.stringify({ model: "fake-model", choices: [{ message, finish_reason: reply.toolCall ? "tool_calls" : "stop" }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  const requestCount = (n: number): Promise<void> => {
    const { promise, resolve } = Promise.withResolvers<void>();
    waiters.push({ n, resolve });
    return promise;
  };
  return { fetchImpl, requests, requestCount };
}

const FINDING = (title: string, severity = "major") => `### FINDING\nseverity: ${severity}\nlines: 1-2\ntitle: ${title}\nBecause reasons.\n`;

async function setup(replies: Reply[], options: { configured?: boolean; bb?: () => ReviewEngine; currentReviewer?: ((threadId: string | null) => Promise<ReviewerSnapshot>) | null; config?: () => Promise<{ baseUrl: string; model: string; apiKey: string; timeoutMs: number } | null>; threadProject?: (threadId: string) => Promise<string | null> } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "egm-eng-")));
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nFirst version.\n");
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const statement of MIGRATIONS) db.exec(statement);
  const store = new Store(db);
  const endpoint = fakeEndpoint(replies);
  const goldfish = new GoldfishClient(
    options.config ?? (async () => (options.configured === false ? null : { baseUrl: "http://fake/v1", model: "m", apiKey: "k", timeoutMs: 5000 })),
    endpoint.fetchImpl,
  );
  const engine = new Engine({
    store,
    goldfish,
    reviewer: options.bb,
    ...(options.currentReviewer === null ? {} : { currentReviewer: options.currentReviewer ?? (async () => ({ engine: "goldfish" as const, provider: "http://fake/v1", model: "m", environmentId: null })) }),
    threadProject: options.threadProject ?? (async () => "proj"),
    projectRoot: async () => root,
    changed: () => {},
    log: { info: () => {}, warn: () => {} },
  });
  const spec = await engine.registerSpec("proj", "docs/spec.md");
  /** Start a review and wait for it, and any round it starts, to finish. */
  const review = async (preset: "implementation" | "feature_spec", extra: { maxRounds?: number; context?: string[] } = {}) => {
    const run = await engine.startRun(spec.id, {
      preset,
      context: extra.context ?? [],
      maxRounds: extra.maxRounds ?? 3,
      threadId: null,
    });
    await engine.settle();
    return store.getRun(run.id)!;
  };
  return { root, db, store, engine, spec, endpoint, review };
}

test("review launch is refused when no Goldfish endpoint is configured", async () => {
  const { engine, spec } = await setup([], { configured: false });
  await assert.rejects(
    engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 3, threadId: null }),
    /Goldfish review is unavailable/,
  );
});

test("reviewers get a fresh, tool-less request containing only persona, standard, document and chosen context", async () => {
  const { root, endpoint, review } = await setup([{ content: "NO FINDINGS" }]);
  await fs.writeFile(path.join(root, "notes.md"), "context text");
  await fs.writeFile(path.join(root, "secret.md"), "not chosen");
  const run = await review("implementation", { context: ["notes.md"] });
  assert.equal(run.state, "completed");
  assert.equal(endpoint.requests.length, 1);
  const request = endpoint.requests[0]!;
  assert.equal(request.tools, undefined);
  assert.deepEqual(request.messages.map((m) => m.role), ["system", "user"]);
  const user = request.messages[1]!.content;
  assert.match(user, /First version\./);
  assert.match(user, /context text/);
  assert.doesNotMatch(user, /not chosen/);
});

test("a reviewer answer that calls a tool is discarded and the run fails, never succeeds", async () => {
  const { store, review } = await setup([{ toolCall: true }]);
  const run = await review("implementation");
  assert.equal(run.state, "failed");
  assert.match(run.stateReason ?? "", /tried to call a tool/);
  assert.equal(store.listFindingsForRun(run.id).length, 0);
});

test("a rate-limited reviewer ends the run as limit_reached with partial results kept", async () => {
  const { store, review } = await setup([{ content: FINDING("Gap A") }, { status: 429 }]);
  const run = await review("feature_spec");
  assert.equal(run.state, "limit_reached");
  assert.deepEqual(store.listStages(run.id).map((s) => s.state), ["completed", "failed", "skipped", "skipped"]);
  assert.equal(store.listFindingsForRun(run.id).length, 1);
});

test("decisions resolve findings; trade-offs need a reason and stay distinct from dismissals", async () => {
  const { engine, spec, store, review } = await setup([{ content: FINDING("Gap A") + FINDING("Gap B", "nit") }]);
  const run = await review("implementation");
  assert.equal(run.state, "awaiting_decisions");
  const [a, b] = store.listFindingsForRun(run.id);
  await assert.rejects(engine.decide(a!.id, "accept_tradeoff", "  ", "human", "op1"), /needs a reason/);
  await engine.decide(a!.id, "accept_tradeoff", "cost is acceptable", "human", "op2");
  assert.equal(store.getRun(run.id)!.state, "awaiting_decisions");
  await engine.decide(b!.id, "dismiss", "", "human", "op3");
  await engine.settle();
  // Nothing was changed, so no next round: the run completes.
  const runs = store.listRuns(spec.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.state, "completed");
  assert.deepEqual(store.listFindingsForRun(run.id).map((f) => f.state).sort(), ["accepted_tradeoff", "dismissed"]);
});

test("a repeated decision with the same operation id is a no-op", async () => {
  const { engine, store, review } = await setup([{ content: FINDING("Gap A") + FINDING("Gap B") }]);
  const run = await review("implementation");
  const [a] = store.listFindingsForRun(run.id);
  const first = await engine.decide(a!.id, "dismiss", "", "human", "same-op");
  const again = await engine.decide(a!.id, "dismiss", "", "human", "same-op");
  assert.deepEqual(again, first);
});

test("concurrent decisions with the same operation id return the same result", async () => {
  const { engine, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const results = await Promise.all([
    engine.decide(finding!.id, "dismiss", "", "human", "same-op"),
    engine.decide(finding!.id, "dismiss", "", "human", "same-op"),
  ]);
  assert.deepEqual(results[0], results[1]);
});

test("proposals reject findings from different review runs without changing workflow state", async () => {
  const { engine, spec, store, review } = await setup([{ content: FINDING("First gap") }, { content: FINDING("Second gap") }]);
  const firstRun = await review("implementation");
  const [first] = store.listFindingsForRun(firstRun.id);
  const secondRun = await review("implementation");
  const [second] = store.listFindingsForRun(secondRun.id);
  // Simulate unresolved findings from two runs, as can exist in persisted data.
  store.setFindingState(first!.id, "open");

  for (const ids of [[first!.id, second!.id], [second!.id, first!.id]]) {
    await assert.rejects(engine.propose(spec.id, ids, "# Spec\n\nSecond version.\n", "fix", "thr"), /same review run/);
    assert.deepEqual(store.listProposals(spec.id), []);
    assert.equal(store.getFinding(first!.id)!.state, "open");
    assert.equal(store.getFinding(second!.id)!.state, "open");
  }
});

test("confirmed apply preserves a backup, resolves the finding, and starts the next round", async () => {
  const { root, engine, spec, store, endpoint, review } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nSecond version.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "cover gap A", "thr_1");
  assert.match(proposal.diff, /^-First version\.$/m);
  assert.match(proposal.diff, /^\+Second version\.$/m);
  const applied = await engine.applyProposal(proposal.id, proposal.baseHash, "op-apply");
  await engine.settle();
  assert.equal(applied.state, "applied");
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), content);
  const backups = (await fs.readdir(path.join(root, "docs"))).filter((name) => name.startsWith(".spec.md.egm-pre-"));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(root, "docs", backups[0]!), "utf8"), "# Spec\n\nFirst version.\n");
  assert.equal(store.getFinding(finding!.id)!.state, "fixed");
  assert.equal(store.getRun(run.id)!.state, "completed");
  assert.deepEqual(await engine.applyProposal(proposal.id, proposal.baseHash, "op-apply"), applied);
  assert.deepEqual(store.listApplyIntents(), []);
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 1);
  assert.equal(endpoint.requests.length, 2);
});

test("apply rejects an unconfirmed base hash without changing the file or workflow", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nSecond version.\n", "fix", "thr");
  await assert.rejects(engine.applyProposal(proposal.id, "wrong-hash", "op-wrong"));
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), "# Spec\n\nFirst version.\n");
  assert.equal(store.getProposal(proposal.id)!.state, "proposed");
  assert.equal(store.getFinding(finding!.id)!.state, "proposal_pending");
  assert.equal(store.getOperation("op-wrong"), null);
  assert.deepEqual(store.listApplyIntents(), []);
});

test("apply detects an independently edited base without overwriting it", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nSecond version.\n", "fix", "thr");
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nHuman edited.\n");
  const result = await engine.applyProposal(proposal.id, proposal.baseHash, "op-stale");
  assert.equal(result.state, "stale");
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), "# Spec\n\nHuman edited.\n");
  assert.equal(store.getFinding(finding!.id)!.state, "fix_requested");
  assert.deepEqual(store.listApplyIntents(), []);
});

test("a conflict releases its findings for immediate reproposal", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nProposed.\n", "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const putIntent = store.putApplyIntent.bind(store);
  store.putApplyIntent = (intent) => {
    putIntent(intent);
    writeFileSync(target, "# Spec\n\nConcurrent edit.\n");
  };
  const result = await engine.applyProposal(proposal.id, proposal.baseHash, "op-conflict");
  assert.equal(result.state, "conflict");
  assert.equal(store.getFinding(finding!.id)!.state, "fix_requested");
  assert.equal(store.getFinding(finding!.id)!.proposalId, null);
  assert.deepEqual(store.listApplyIntents(), []);
  const replacement = await engine.propose(spec.id, [finding!.id], "# Spec\n\nReplacement.\n", "retry", "thr");
  assert.equal(replacement.state, "proposed");
});

test("an outstanding apply intent blocks another proposal for the same spec", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") + FINDING("Gap B") }]);
  const run = await review("implementation");
  const [first, second] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [first!.id], "# Spec\n\nFirst change.\n", "first", "thr");
  const other = await engine.propose(spec.id, [second!.id], "# Spec\n\nSecond change.\n", "second", "thr");
  const target = path.join(root, "docs/spec.md");
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: path.join(root, "docs/backup"), stagedPath: path.join(root, "docs/staged"), baseHash: proposal.baseHash, resultHash: proposal.resultHash, createdAt: Date.now(), operationId: "first-apply" });

  await assert.rejects(engine.applyProposal(other.id, other.baseHash, "second-apply"), /unfinished apply/);
  assert.equal(await fs.readFile(target, "utf8"), "# Spec\n\nFirst version.\n");
  assert.equal(store.getProposal(other.id)!.state, "proposed");
  assert.equal(store.getFinding(second!.id)!.state, "proposal_pending");
  assert.equal(store.getOperation("second-apply"), null);
  assert.equal(store.listApplyIntents().length, 1);
});

test("an independent edit makes the proposal stale and the run outdated; apply refuses to overwrite", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [a] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [a!.id], "# Spec\n\nElephant version.\n", "fix", "thr");
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nHuman edited.\n");
  const { spec: described } = await engine.describeSpec(spec);
  assert.equal(described.latestRun!.stale, true);
  assert.equal(store.getProposal(proposal.id)!.state, "stale");
  assert.equal(store.getFinding(a!.id)!.state, "fix_requested");
  const replacement = await engine.propose(spec.id, [a!.id], "# Spec\n\nReplacement.\n", "fix", "thr");
  assert.equal(replacement.state, "proposed");
  await assert.rejects(engine.applyProposal(proposal.id, proposal.baseHash, "op1"), /stale/i);
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), "# Spec\n\nHuman edited.\n");
});

test("an edit between stages stops the review as stale instead of finishing on mixed versions", async () => {
  const gate = Promise.withResolvers<void>();
  const { root, engine, spec, store, endpoint } = await setup([{ content: FINDING("Gap A"), gate: gate.promise }]);
  const run = await engine.startRun(spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
  await endpoint.requestCount(1);
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nEdited mid-review.\n");
  gate.resolve();
  await engine.settle();
  const after = store.getRun(run.id)!;
  assert.equal(after.state, "stale");
  assert.equal(endpoint.requests.length, 1);
  assert.deepEqual(store.listStages(run.id).map((s) => s.state), ["completed", "skipped", "skipped", "skipped"]);
  // The finding from the stage that ran is kept, about the version it reviewed.
  assert.equal(store.listFindingsForRun(run.id).length, 1);
});

test("an edit during the final stage marks the review stale", async () => {
  const gate = Promise.withResolvers<void>();
  const { root, engine, spec, store, endpoint } = await setup([{ content: "NO FINDINGS", gate: gate.promise }]);
  const run = await engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 3, threadId: null });
  await endpoint.requestCount(1);
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nEdited during final stage.\n");
  gate.resolve();
  await engine.settle();
  assert.equal(store.getRun(run.id)!.state, "stale");
});

test("recovered apply resumes resolution and starts a new round", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nRecovered change.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/recovery-backup");
  const staged = path.join(root, "docs/recovery-staged");
  await fs.copyFile(target, backup);
  await fs.writeFile(target, content);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: staged, baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now() });
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.getProposal(proposal.id)!.state, "applied");
  assert.equal(store.getFinding(finding!.id)!.state, "fixed");
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 1);
});

test("restart leaves an uncommitted proposal available for confirmation", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nRecovered change.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/recovery-backup");
  const staged = path.join(root, "docs/recovery-staged");
  await fs.copyFile(target, backup);
  await fs.writeFile(staged, content);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: staged, baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now() });
  await engine.reconcile();
  assert.equal(store.getProposal(proposal.id)!.state, "proposed");
  assert.equal(store.getFinding(finding!.id)!.state, "proposal_pending");
  assert.equal(await fs.readFile(target, "utf8"), "# Spec\n\nFirst version.\n");
  assert.deepEqual(store.listApplyIntents(), []);
  assert.equal(store.listRuns(spec.id).length, 1);
});

test("restart marks an ambiguous apply unknown without overwriting the document", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nRecovered change.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/recovery-backup");
  const staged = path.join(root, "docs/recovery-staged");
  await fs.copyFile(target, backup);
  await fs.writeFile(target, "# Spec\n\nExternal change.\n");
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: staged, baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now() });
  await engine.reconcile();
  assert.equal(store.getProposal(proposal.id)!.state, "unknown");
  assert.equal(store.getProposal(proposal.id)!.backupPath, backup);
  assert.equal(store.getFinding(finding!.id)!.state, "fix_requested");
  assert.equal(store.getFinding(finding!.id)!.proposalId, null);
  assert.equal(await fs.readFile(target, "utf8"), "# Spec\n\nExternal change.\n");
  assert.equal(await fs.readFile(backup, "utf8"), "# Spec\n\nFirst version.\n");
  assert.deepEqual(store.listApplyIntents(), []);
  assert.equal(store.listRuns(spec.id).length, 1);
});

test("recovery finalizes a stale proposal and restores its apply receipt", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nRecovered change.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/recovery-backup");
  await fs.copyFile(target, backup);
  await fs.writeFile(target, content);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/recovery-staged"), baseHash: proposal.baseHash, resultHash: sha256(content), operationId: "recovered-op", createdAt: Date.now() });
  // Older refreshes could stale an intent-owned proposal and release its finding.
  assert.equal(store.setProposalState(proposal.id, ["proposed"], "stale", "document changed"), true);
  store.setFindingState(finding!.id, "fix_requested", null);
  const detached = store.getFinding(finding!.id);
  await assert.rejects(engine.decide(finding!.id, "dismiss", "", "human", "legacy-decision"), /unfinished apply/);
  await assert.rejects(engine.propose(spec.id, [finding!.id], "# Spec\n\nReplacement.\n", "replace", "thr"), /unfinished apply/);
  await assert.rejects(engine.contest(finding!.id, "not applicable"), /unfinished apply/);
  assert.deepEqual(store.getFinding(finding!.id), detached);
  assert.equal(store.getProposal(proposal.id)!.state, "stale");
  assert.equal(store.getOperation("legacy-decision"), null);
  assert.equal(store.listProposals(spec.id).length, 1);
  assert.equal(store.listApplyIntents().length, 1);
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.getProposal(proposal.id)!.state, "applied");
  assert.equal(store.getProposal(proposal.id)!.backupPath, backup);
  assert.equal(store.getFinding(finding!.id)!.state, "fixed");
  const receipt = await engine.applyProposal(proposal.id, proposal.baseHash, "recovered-op");
  assert.equal(receipt.state, "applied");
  assert.deepEqual(await engine.applyProposal(proposal.id, proposal.baseHash, "recovered-op"), receipt);
  assert.deepEqual(store.listApplyIntents(), []);
});

test("a decision on a shared proposal releases its other findings", async () => {
  const { engine, spec, store, review } = await setup([{ content: FINDING("Gap A") + FINDING("Gap B") }]);
  const run = await review("implementation");
  const [a, b] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [a!.id, b!.id], "# Spec\n\nFixed.\n", "fix", "thr");
  await engine.decide(a!.id, "dismiss", "", "human", "dismiss-shared");
  assert.equal(store.getProposal(proposal.id)!.state, "rejected");
  assert.equal(store.getFinding(a!.id)!.state, "dismissed");
  assert.equal(store.getFinding(b!.id)!.state, "fix_requested");
  assert.equal(store.getFinding(b!.id)!.proposalId, null);
  const replacement = await engine.propose(spec.id, [b!.id], "# Spec\n\nAnother fix.\n", "fix", "thr");
  assert.equal(replacement.state, "proposed");
});

test("rejecting a stale proposal does not release findings claimed by its replacement", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const old = await engine.propose(spec.id, [finding!.id], "# Spec\n\nOld fix.\n", "fix", "thr");
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nHuman edit.\n");
  await engine.describeSpec(spec);
  const replacement = await engine.propose(spec.id, [finding!.id], "# Spec\n\nNew fix.\n", "fix", "thr");
  await engine.rejectProposal(old.id, "obsolete");
  assert.equal(store.getFinding(finding!.id)!.state, "proposal_pending");
  assert.equal(store.getFinding(finding!.id)!.proposalId, replacement.id);
  assert.equal((await engine.applyProposal(replacement.id, replacement.baseHash, "apply-replacement")).state, "applied");
  await engine.settle();
});

test("a new review finishes superseded runs without resurrecting them on restart", async () => {
  const { engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }]);
  const old = await review("implementation");
  const [finding] = store.listFindingsForRun(old.id);
  await review("implementation");
  assert.equal(store.getFinding(finding!.id)!.state, "superseded");
  assert.notEqual(store.getRun(old.id)!.state, "awaiting_decisions");
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.listRuns(spec.id).filter((run) => run.parentRunId === old.id).length, 0);
});

test("restart does not continue an applied round after an independent edit", async () => {
  const { root, engine, spec, store, endpoint, review } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nApplied.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  store.setProposalState(proposal.id, ["proposed"], "applied", "recovered", { appliedAt: Date.now() });
  store.setFindingState(finding!.id, "fixed");
  store.setRunState(run.id, ["awaiting_decisions"], "completed", "continued in round 2", true);
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nIndependent edit.\n");
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.getRun(run.id)!.state, "stale");
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 0);
  assert.equal(endpoint.requests.length, 1);
});

test("restart resumes a recorded continuation only once", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nApplied.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  await fs.writeFile(path.join(root, "docs/spec.md"), content);
  store.setProposalState(proposal.id, ["proposed"], "applied", "recovered", { appliedAt: Date.now() });
  store.setFindingState(finding!.id, "fixed");
  store.setRunState(run.id, ["awaiting_decisions"], "completed", "continued in round 2", true);
  await engine.reconcile();
  await engine.settle();
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 1);
});

test("cancelling a running review marks it cancelled with unfinished stages cancelled", async () => {
  const { engine, spec, store, endpoint } = await setup([{ hang: true }]);
  const run = await engine.startRun(spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
  await endpoint.requestCount(1);
  engine.cancelRun(run.id);
  await engine.settle();
  assert.equal(store.getRun(run.id)!.state, "cancelled");
  assert.ok(store.listStages(run.id).every((s) => s.state === "cancelled"));
});

test("restart reconciliation marks interrupted runs failed and keeps partial results", async () => {
  const { engine, spec, store, db, root, endpoint } = await setup([{ content: FINDING("Gap A") }, { hang: true }]);
  const run = await engine.startRun(spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
  // The first stage answers at once; wait until the second (hanging) stage is in flight.
  await endpoint.requestCount(2);
  const restarted = new Engine({
    store: new Store(db),
    goldfish: new GoldfishClient(async () => null),
    threadProject: async () => "proj",
    projectRoot: async () => root,
    changed: () => {},
    log: { info: () => {}, warn: () => {} },
  });
  await restarted.reconcile();
  const after = store.getRun(run.id)!;
  assert.equal(after.state, "failed");
  assert.match(after.stateReason ?? "", /restart/);
  assert.equal(store.listFindingsForRun(run.id).length, 1);
  engine.dispose();
  await engine.settle();
  assert.equal(store.getRun(run.id)!.state, "failed");
});

test("an unparseable report is kept whole as one finding instead of being dropped", async () => {
  const { store, review } = await setup([{ content: "The doc lacks a rollback plan, and cost is unclear." }]);
  const run = await review("implementation");
  const findings = store.listFindingsForRun(run.id);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, "unknown");
  assert.match(findings[0]!.body, /rollback plan/);
});

test("an outstanding apply intent blocks rejection, decisions, and superseding reviews", async () => {
  const { root, engine, spec, store, review, endpoint } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nRecovered change.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: path.join(root, "docs/backup"), stagedPath: path.join(root, "docs/staged"), baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now(), operationId: "pending-apply" });

  await assert.rejects(engine.rejectProposal(proposal.id, "reject"), /unfinished apply/);
  await assert.rejects(engine.decide(finding!.id, "dismiss", "", "human", "pending-decision"), /unfinished apply/);
  await assert.rejects(engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 3, threadId: null }), /unfinished apply/);
  assert.equal(store.getProposal(proposal.id)!.state, "proposed");
  assert.equal(store.getFinding(finding!.id)!.state, "proposal_pending");
  assert.equal(store.getFinding(finding!.id)!.proposalId, proposal.id);
  assert.equal(store.getRun(run.id)!.state, "awaiting_decisions");
  assert.equal(store.listRuns(spec.id).length, 1);
  assert.equal(endpoint.requests.length, 1);
  assert.equal(store.getOperation("pending-decision"), null);
  assert.equal(store.listApplyIntents().length, 1);
});

test("refresh preserves intent-owned proposals and findings while blocking decisions and reproposals", async () => {
  for (const diskContent of ["# Spec\n\nRecovered change.\n", "# Spec\n\nIndependent edit.\n"]) {
    const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") + FINDING("Gap B") }]);
    const run = await review("implementation");
    const [owned, other] = store.listFindingsForRun(run.id);
    const content = "# Spec\n\nRecovered change.\n";
    const proposal = await engine.propose(spec.id, [owned!.id], content, "fix", "thr");
    const unrelated = await engine.propose(spec.id, [other!.id], "# Spec\n\nOther change.\n", "other fix", "thr");
    const target = path.join(root, "docs/spec.md");
    const backup = path.join(root, "docs/backup");
    await fs.copyFile(target, backup);
    store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/staged"), baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now(), operationId: "pending-refresh" });
    await fs.writeFile(target, diskContent);

    const beforeProposal = store.getProposal(proposal.id);
    const beforeFinding = store.getFinding(owned!.id);
    await engine.describeSpec(spec);
    assert.deepEqual(store.getProposal(proposal.id), beforeProposal);
    assert.deepEqual(store.getFinding(owned!.id), beforeFinding);
    assert.equal(store.getProposal(unrelated.id)!.state, "stale");
    assert.equal(store.getFinding(other!.id)!.state, "fix_requested");
    for (const kind of ["request_fix", "accept_tradeoff", "dismiss"] as const) {
      await assert.rejects(engine.decide(owned!.id, kind, "reason", "human", `pending-${kind}`), /unfinished apply/);
      assert.equal(store.getOperation(`pending-${kind}`), null);
    }
    await assert.rejects(engine.propose(spec.id, [owned!.id], "# Spec\n\nReplacement.\n", "replace", "thr"), /unfinished apply/);
    assert.deepEqual(store.getProposal(proposal.id), beforeProposal);
    assert.deepEqual(store.getFinding(owned!.id), beforeFinding);
    assert.equal(store.listProposals(spec.id).length, 2);
    assert.equal(store.listApplyIntents().length, 1);

    await engine.reconcile();
    assert.equal(store.listApplyIntents().length, 0);
    assert.equal(store.getProposal(proposal.id)!.state, diskContent === content ? "applied" : "unknown");
    assert.equal(store.getFinding(owned!.id)!.state, diskContent === content ? "fixed" : "fix_requested");
  }
});

test("failed reconciliation transition retains intent without fixing findings or recording a receipt", async () => {
  const { root, engine, spec, store, review } = await setup([{ content: FINDING("Gap A") }]);
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nRecovered change.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/backup");
  await fs.copyFile(target, backup);
  await fs.writeFile(target, content);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/staged"), baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now(), operationId: "failed-reconcile" });
  assert.equal(store.setProposalState(proposal.id, ["proposed"], "rejected", "concurrent transition"), true);

  await assert.rejects(engine.reconcile(), /state changed during reconciliation/);
  assert.equal(store.getProposal(proposal.id)!.state, "rejected");
  assert.equal(store.getFinding(finding!.id)!.state, "proposal_pending");
  assert.equal(store.getFinding(finding!.id)!.proposalId, proposal.id);
  assert.equal(store.getOperation("failed-reconcile"), null);
  assert.equal(store.listApplyIntents().length, 1);
  assert.equal(store.listApplyIntents()[0]!.proposalId, proposal.id);
  assert.equal(await fs.readFile(backup, "utf8"), "# Spec\n\nFirst version.\n");
});

test("an ad hoc proposal applies without synthetic findings and starts a default fresh review", async () => {
  const { root, engine, spec, store, endpoint } = await setup([]);
  const content = "# Spec\n\nAd hoc change.\n";
  const proposal = await engine.propose(spec.id, [], content, "improve the spec", "thr");
  assert.equal(proposal.runId, null);
  assert.deepEqual(proposal.findingIds, []);
  assert.deepEqual(store.listRuns(spec.id), []);
  assert.deepEqual(store.listFindings(spec.id), []);
  assert.match(proposal.diff, /^\+Ad hoc change\.$/m);

  const applied = await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-apply");
  await engine.settle();
  assert.equal(applied.state, "applied");
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), content);
  assert.equal(await fs.readFile(applied.backupPath!, "utf8"), "# Spec\n\nFirst version.\n");
  assert.deepEqual(store.listFindings(spec.id), []);
  assert.deepEqual(store.listApplyIntents(), []);
  const runs = store.listRuns(spec.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.preset, "full");
  assert.equal(runs[0]!.maxRounds, 3);
  assert.deepEqual(runs[0]!.context, []);
  assert.equal(runs[0]!.parentRunId, null);
  assert.equal(runs[0]!.targetHash, sha256(content));
  assert.equal(endpoint.requests.length, 5);
  assert.deepEqual(await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-apply"), applied);
});

test("an ad hoc apply starts a fresh review using the latest review configuration", async () => {
  const { root, engine, spec, store } = await setup([]);
  await fs.writeFile(path.join(root, "notes.md"), "review context");
  const prior = await engine.startRun(spec.id, { preset: "custom", lenses: ["design_critic"], standard: "feature-spec-standard", context: ["notes.md"], maxRounds: 2, threadId: "prior-thread" });
  await engine.settle();
  const priorStages = store.listStages(prior.id).map(({ lens, standard }) => ({ lens, standard }));
  const content = "# Spec\n\nChanged independently.\n";
  const proposal = await engine.propose(spec.id, [], content, "change", "thr");
  await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-custom");
  await engine.settle();
  const runs = store.listRuns(spec.id);
  assert.equal(runs.length, 2);
  const fresh = runs.find((run) => run.id !== prior.id)!;
  assert.equal(fresh.parentRunId, null);
  assert.equal(fresh.round, 1);
  assert.equal(fresh.preset, prior.preset);
  assert.equal(fresh.maxRounds, prior.maxRounds);
  assert.deepEqual(fresh.context, prior.context);
  assert.equal(fresh.targetHash, sha256(content));
  assert.deepEqual(store.listStages(fresh.id).map(({ lens, standard }) => ({ lens, standard })), priorStages);
  assert.deepEqual(store.listFindings(spec.id), []);
});

test("ad hoc proposals enforce confirmation and disk hashes without starting a review", async () => {
  const { root, engine, spec, store } = await setup([]);
  const proposal = await engine.propose(spec.id, [], "# Spec\n\nProposed.\n", "change", "thr");
  await assert.rejects(engine.applyProposal(proposal.id, "wrong-hash", "ad-hoc-wrong"));
  assert.equal(store.getProposal(proposal.id)!.state, "proposed");
  assert.equal(store.getOperation("ad-hoc-wrong"), null);
  const edited = "# Spec\n\nIndependent edit.\n";
  await fs.writeFile(path.join(root, "docs/spec.md"), edited);
  const result = await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-stale");
  await engine.settle();
  assert.equal(result.state, "stale");
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), edited);
  assert.deepEqual(store.listRuns(spec.id), []);
  assert.deepEqual(store.listFindings(spec.id), []);
  assert.deepEqual(store.listApplyIntents(), []);
});

test("ad hoc proposals cannot be created or applied during a running review", async () => {
  const { engine, spec, store, endpoint } = await setup([{ hang: true }]);
  const proposal = await engine.propose(spec.id, [], "# Spec\n\nProposed.\n", "change", "thr");
  const run = await engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 3, threadId: null });
  await endpoint.requestCount(1);
  // A new review normally supersedes the proposal; restore it to exercise the apply guard independently.
  assert.equal(store.setProposalState(proposal.id, ["stale"], "proposed", null), true);
  await assert.rejects(engine.propose(spec.id, [], "# Spec\n\nOther.\n", "change", "thr"), /review.*running|review finishes/i);
  await assert.rejects(engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-running"), /review.*running|review finishes/i);
  assert.equal(store.getOperation("ad-hoc-running"), null);
  assert.deepEqual(store.listFindings(spec.id), []);
  engine.cancelRun(run.id);
  await engine.settle();
});

test("an unfinished apply blocks ad hoc proposals and confirmed recovery starts a review", async () => {
  const { root, engine, spec, store } = await setup([]);
  const content = "# Spec\n\nRecovered ad hoc change.\n";
  const proposal = await engine.propose(spec.id, [], content, "change", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/ad-hoc-backup");
  await fs.copyFile(target, backup);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/ad-hoc-staged"), baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now(), operationId: "ad-hoc-recovered" });
  await assert.rejects(engine.propose(spec.id, [], "# Spec\n\nAnother change.\n", "other", "thr"), /unfinished apply/);
  await fs.writeFile(target, content);
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.getProposal(proposal.id)!.state, "applied");
  assert.ok(store.getOperation("ad-hoc-recovered"));
  assert.deepEqual(store.listApplyIntents(), []);
  assert.deepEqual(store.listFindings(spec.id), []);
  const runs = store.listRuns(spec.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.parentRunId, null);
  assert.equal(runs[0]!.targetHash, sha256(content));
});

test("ad hoc apply defers re-review until existing findings are resolved", async () => {
  const { engine, spec, store, endpoint, review } = await setup([{ content: FINDING("Gap A") + FINDING("Gap B") }]);
  const prior = await review("implementation");
  const [first, second] = store.listFindingsForRun(prior.id);
  const content = "# Spec\n\nIndependent improvement.\n";
  const proposal = await engine.propose(spec.id, [], content, "improve", "thr");
  await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-deferred");
  await engine.settle();
  assert.equal(store.listRuns(spec.id).length, 1);
  assert.equal(endpoint.requests.length, 1);
  assert.equal(store.getFinding(first!.id)!.state, "open");
  assert.equal(store.getFinding(second!.id)!.state, "open");

  await engine.decide(first!.id, "dismiss", "not needed", "human", "deferred-first");
  await engine.settle();
  assert.equal(store.listRuns(spec.id).length, 1);
  assert.equal(store.getFinding(second!.id)!.state, "open");
  await engine.decide(second!.id, "dismiss", "not needed", "human", "deferred-second");
  await engine.settle();
  const runs = store.listRuns(spec.id);
  assert.equal(runs.length, 2);
  const fresh = runs.find((run) => run.id !== prior.id)!;
  assert.equal(fresh.parentRunId, null);
  assert.equal(fresh.targetHash, sha256(content));
  assert.equal(endpoint.requests.length, 2);
});

test("deferred ad hoc reviews supersede older applied versions across reconciliation", async () => {
  const { engine, spec, store, review, endpoint } = await setup([{ content: FINDING("Gap A") }]);
  const prior = await review("implementation");
  const finding = store.listFindingsForRun(prior.id)[0]!;
  const first = await engine.propose(spec.id, [], "# Spec\n\nFirst change.\n", "first", "thr");
  await engine.applyProposal(first.id, first.baseHash, "deferred-old");
  const oldTask = store.getAdHocReviewTask(first.id)!;
  const content = "# Spec\n\nSecond change.\n";
  const second = await engine.propose(spec.id, [], content, "second", "thr");
  await engine.applyProposal(second.id, second.baseHash, "deferred-new");
  assert.equal(store.getAdHocReviewTask(first.id), null);
  store.putAdHocReviewTask({ ...oldTask, createdAt: 1 });
  await engine.reconcile();
  await engine.decide(finding.id, "dismiss", "resolved", "human", "deferred-resolve");
  await engine.settle();
  const fresh = store.listRuns(spec.id).find((run) => run.id !== prior.id)!;
  assert.equal(fresh.targetHash, sha256(content));
  assert.equal(store.listPendingAdHocReviewTasks().length, 0);
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.listRuns(spec.id).length, 2);
  assert.equal(endpoint.requests.length, 2);
});

test("a manual review consumes the deferred task across reconciliation", async () => {
  const { engine, spec, store, review, endpoint } = await setup([{ content: FINDING("Old gap") }, { content: FINDING("New gap") }]);
  const prior = await review("implementation");
  const proposal = await engine.propose(spec.id, [], "# Spec\n\nManual target.\n", "change", "thr");
  await engine.applyProposal(proposal.id, proposal.baseHash, "manual-deferred");
  const manual = await engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 3, threadId: null });
  await engine.settle();
  assert.equal(store.getAdHocReviewTask(proposal.id)!.runId, manual.id);
  await engine.reconcile();
  await engine.decide(store.listFindingsForRun(manual.id)[0]!.id, "dismiss", "resolved", "human", "manual-resolve");
  await engine.settle();
  await engine.reconcile();
  await engine.settle();
  assert.equal(store.listRuns(spec.id).length, 2);
  assert.equal(endpoint.requests.length, 2);
  assert.notEqual(prior.id, manual.id);
});

for (const terminal of ["failed", "cancelled"] as const) {
  for (const recovered of [false, true]) {
    test(`a ${recovered ? "recovered" : "confirmed"} partial fix advances a deferred review on a ${terminal} run`, async () => {
      const { root, engine, spec, store, endpoint } = await setup([{ content: FINDING("Partial gap") + FINDING("Another gap") }, terminal === "failed" ? { toolCall: true } : { hang: true }]);
      const run = await engine.startRun(spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
      if (terminal === "cancelled") { await endpoint.requestCount(2); engine.cancelRun(run.id); }
      await engine.settle();
      const original = store.getRun(run.id)!;
      assert.equal(original.state, terminal);
      const adHoc = await engine.propose(spec.id, [], "# Spec\n\nIndependent change.\n", "change", "thr");
      await engine.applyProposal(adHoc.id, adHoc.baseHash, `defer-fix-${terminal}-${recovered}`);
      const content = "# Spec\n\nIndependent change and finding fix.\n";
      const fix = await engine.propose(spec.id, [store.listFindingsForRun(run.id)[0]!.id], content, "fix", "thr");
      const op = `fix-${terminal}-${recovered}`;
      if (recovered) {
        const target = path.join(root, "docs/spec.md");
        const backup = path.join(root, "docs/fix-backup");
        await fs.copyFile(target, backup);
        store.putApplyIntent({ proposalId: fix.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/fix-staged"), baseHash: fix.baseHash, resultHash: fix.resultHash, createdAt: Date.now(), operationId: op });
        await fs.writeFile(target, content);
        await engine.reconcile();
      } else await engine.applyProposal(fix.id, fix.baseHash, op);
      await engine.settle();
      assert.equal(store.listRuns(spec.id).length, 1);
      assert.equal(store.getAdHocReviewTask(adHoc.id)!.targetHash, sha256(content));
      await engine.decide(store.listFindingsForRun(run.id).find((finding) => finding.state === "open")!.id, "dismiss", "resolved", "human", `remaining-${terminal}-${recovered}`);
      await engine.settle();
      assert.equal(store.listRuns(spec.id).length, 2);
      assert.equal(store.listRuns(spec.id).find((candidate) => candidate.id !== run.id)!.targetHash, sha256(content));
      assert.equal(store.getRun(run.id)!.state, terminal);
      assert.equal(store.getRun(run.id)!.stateReason, original.stateReason);
      assert.ok(store.getOperation(op));
      await engine.applyProposal(fix.id, fix.baseHash, op);
      await engine.reconcile();
      await engine.settle();
      assert.equal(store.listRuns(spec.id).length, 2);
    });
  }
}

for (const terminal of ["failed", "cancelled"] as const) {
  test(`resolving a partial finding on a ${terminal} run releases a deferred ad hoc review`, async () => {
    const { engine, spec, store, endpoint } = await setup([{ content: FINDING("Partial gap") }, terminal === "failed" ? { toolCall: true } : { hang: true }]);
    const run = await engine.startRun(spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
    if (terminal === "cancelled") {
      await endpoint.requestCount(2);
      engine.cancelRun(run.id);
    }
    await engine.settle();
    const original = store.getRun(run.id)!;
    assert.equal(original.state, terminal);
    const finding = store.listFindingsForRun(run.id)[0]!;
    const content = "# Spec\n\nIndependent change.\n";
    const proposal = await engine.propose(spec.id, [], content, "change", "thr");
    await engine.applyProposal(proposal.id, proposal.baseHash, `partial-${terminal}`);
    await engine.decide(finding.id, "dismiss", "resolved", "human", `resolve-${terminal}`);
    await engine.settle();
    const fresh = store.listRuns(spec.id).find((candidate) => candidate.id !== run.id)!;
    assert.equal(fresh.targetHash, sha256(content));
    assert.equal(store.getRun(run.id)!.state, terminal);
    assert.equal(store.getRun(run.id)!.stateReason, original.stateReason);
  });
}

/** Fake BB reviewer: records each worker launch, honors a gate on the first one. */
function fakeBb(replies: string[], firstGate?: Promise<void>) {
  const launches: { provider: string | null; model: string | null; environmentId: string | null }[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  const reviewer: ReviewEngine = {
    engine: "bb",
    status: async () => ({ engine: "bb", ready: true, reason: null, model: null, endpoint: null }),
    complete: async (_messages, _signal, call: ReviewerCall) => {
      launches.push({ provider: call.provider, model: call.model, environmentId: call.environmentId });
      for (const w of waiters.filter((w) => launches.length >= w.n)) w.resolve();
      if (launches.length === 1 && firstGate) await firstGate;
      return { ok: true, text: replies.shift() ?? "NO FINDINGS", model: call.model ?? "bb-worker", truncated: false };
    },
  };
  const started = (n: number): Promise<void> => {
    if (launches.length >= n) return Promise.resolve();
    const { promise, resolve } = Promise.withResolvers<void>();
    waiters.push({ n, resolve });
    return promise;
  };
  return { launches, started, reviewer: () => reviewer };
}

test("revoking BB consent mid-run fails the next stage with no fallback and pins intact", async () => {
  const gate = Promise.withResolvers<void>();
  const bb = fakeBb([FINDING("Gap A")], gate.promise);
  const { engine, spec, store, endpoint } = await setup([], { bb: bb.reviewer });
  store.grantReviewerConsent();
  const run = await engine.startRun(spec.id, { preset: "full", context: [], maxRounds: 3, threadId: null });
  await bb.started(1);
  store.revokeReviewerConsent();
  gate.resolve();
  await engine.settle();
  const failed = store.getRun(run.id)!;
  assert.equal(failed.state, "failed");
  assert.match(failed.stateReason ?? "", /consent was revoked; no BB worker was launched/);
  assert.equal(bb.launches.length, 1);
  assert.equal(endpoint.requests.length, 0);
  const stages = store.listStages(run.id);
  assert.equal(stages.filter((s) => s.state === "completed").length, 1);
  assert.equal(stages.filter((s) => s.state === "failed" && s.error === "BB reviewer consent was revoked").length, 1);
  assert.equal(stages.filter((s) => s.state === "skipped").length, stages.length - 2);
  assert.equal(stages[0]!.model, "bb-worker");
  assert.equal(stages[0]!.provider, null);
});

test("revoking BB consent after the first round blocks the automatic next round", async () => {
  const bb = fakeBb([FINDING("Gap A")]);
  const { engine, spec, store, review } = await setup([], { bb: bb.reviewer });
  store.grantReviewerConsent();
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nSecond version.\n", "cover gap A", "thr_1");
  store.revokeReviewerConsent();
  await engine.applyProposal(proposal.id, proposal.baseHash, "op-apply");
  await engine.settle();
  const failed = store.getRun(run.id)!;
  assert.equal(failed.state, "failed");
  assert.match(failed.stateReason ?? "", /next round could not start: BB reviewer consent was revoked/);
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 0);
  assert.equal(bb.launches.length, 1);
});

test("revoking BB consent blocks restart reconciliation continuations", async () => {
  const bb = fakeBb([FINDING("Gap A")]);
  const { root, engine, spec, store, review } = await setup([], { bb: bb.reviewer });
  store.grantReviewerConsent();
  const run = await review("implementation");
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nApplied.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  await fs.writeFile(path.join(root, "docs/spec.md"), content);
  store.setProposalState(proposal.id, ["proposed"], "applied", "recovered", { appliedAt: Date.now() });
  store.setFindingState(finding!.id, "fixed");
  store.setRunState(run.id, ["awaiting_decisions"], "completed", "continued in round 2", true);
  store.revokeReviewerConsent();
  await engine.reconcile();
  await engine.settle();
  const failed = store.getRun(run.id)!;
  assert.equal(failed.state, "failed");
  assert.match(failed.stateReason ?? "", /next round could not start: BB reviewer consent was revoked/);
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 0);
  assert.equal(bb.launches.length, 1);
});

test("a continuation whose BB thread moved projects fails without another worker", async () => {
  let threadProject = "proj";
  const bb = fakeBb([FINDING("Gap A")]);
  const { engine, spec, store } = await setup([], { bb: bb.reviewer, threadProject: async () => threadProject });
  store.grantReviewerConsent();
  const run = await engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 3, threadId: "thread-a" });
  await engine.settle();
  const [finding] = store.listFindingsForRun(run.id);
  threadProject = "another-project";
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nSecond version.\n", "fix", "thread-a");
  await engine.applyProposal(proposal.id, proposal.baseHash, "thread-moved");
  await engine.settle();
  const failed = store.getRun(run.id)!;
  assert.equal(failed.state, "failed");
  assert.match(failed.stateReason ?? "", /thread no longer belongs to this project/);
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 0);
  assert.equal(bb.launches.length, 1);
});

test("a pinned provider that differs from the live endpoint is never contacted", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const config = { baseUrl: "http://live/v1", model: "m", apiKey: "sk-synthetic-not-real", timeoutMs: 5000 };
  const client = new GoldfishClient(async () => config, fetchImpl);
  const signal = new AbortController().signal;
  const refused = await client.complete([{ role: "user", content: "x" }], signal, { provider: "http://old/v1///", model: "m" });
  assert.equal(refused.ok, false);
  assert.match((refused as { error: string }).error, /endpoint changed/);
  assert.equal(calls, 0);
  // A pinned provider that normalizes to the live endpoint still goes through.
  const allowed = await client.complete([{ role: "user", content: "x" }], signal, { provider: "http://live/v1/", model: "m" });
  assert.equal(allowed.ok, false); // the stub answers `{}` — not a valid completion — but a request was made
  assert.equal(calls, 1);
});

test("a run pinned to a different endpoint fails at start without any chat request", async () => {
  const { engine, spec, endpoint } = await setup([]);
  await assert.rejects(
    engine.startRun(spec.id, {
      preset: "implementation",
      context: [],
      maxRounds: 3,
      threadId: null,
      reviewer: { engine: "goldfish", provider: "http://other/v1", model: "m", environmentId: null },
    }),
    /endpoint changed/,
  );
  assert.equal(endpoint.requests.length, 0);
});

test("an endpoint error reports the HTTP status but never the response body", async () => {
  const { store, review } = await setup([{ status: 500, body: "Authorization: Bearer k rejected by upstream" }]);
  const run = await review("implementation");
  assert.equal(run.state, "failed");
  assert.match(run.stateReason ?? "", /HTTP 500/);
  assert.doesNotMatch(run.stateReason ?? "", /Bearer/);
  for (const stage of store.listStages(run.id)) {
    if (stage.state === "failed") {
      assert.match(stage.error ?? "", /HTTP 500/);
      assert.doesNotMatch(stage.error ?? "", /Bearer/);
    }
  }
});

test("invalid API key format makes no request and does not expose the key", async () => {
  const key = "synthetic-key\r\nnever-send";
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const client = new GoldfishClient(async () => ({ baseUrl: "http://fake/v1", model: "m", apiKey: key, timeoutMs: 5000 }), fetchImpl);
  const status = await client.status();
  const complete = await client.complete([{ role: "user", content: "x" }], new AbortController().signal);
  assert.equal(status.ready, false);
  assert.equal(status.reason, "invalid API key format");
  assert.equal(complete.ok, false);
  if (complete.ok) throw new Error("expected invalid key failure");
  assert.equal(complete.error, "invalid API key format");
  assert.equal(calls, 0);
  assert.doesNotMatch(status.reason ?? "", /synthetic-key/);
});

test("network errors do not expose a synthetic API key", async () => {
  const key = "synthetic-key-not-real";
  const fetchImpl = (async () => {
    throw new Error(`upstream rejected ${key}`);
  }) as typeof fetch;
  const client = new GoldfishClient(async () => ({ baseUrl: "http://fake/v1", model: "m", apiKey: key, timeoutMs: 5000 }), fetchImpl);
  const status = await client.status();
  const complete = await client.complete([{ role: "user", content: "x" }], new AbortController().signal);
  assert.equal(status.ready, false);
  assert.doesNotMatch(status.reason ?? "", /synthetic-key-not-real/);
  assert.equal(complete.ok, false);
  if (complete.ok) throw new Error("expected request failure");
  assert.doesNotMatch(complete.error, /synthetic-key-not-real/);
});

test("a continuation after the configured endpoint changed fails visibly without a second request", async () => {
  const live = { baseUrl: "http://fake/v1" };
  const { engine, spec, store, endpoint } = await setup([{ content: FINDING("Gap A") }, { content: "NO FINDINGS" }], {
    config: async () => ({ baseUrl: live.baseUrl, model: "m", apiKey: "k", timeoutMs: 5000 }),
  });
  const run = await engine.startRun(spec.id, {
    preset: "implementation",
    context: [],
    maxRounds: 3,
    threadId: null,
    reviewer: { engine: "goldfish", provider: "http://fake/v1/", model: "m", environmentId: null },
  });
  await engine.settle();
  const [finding] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nSecond version.\n", "cover gap A", "thr_1");
  live.baseUrl = "http://moved/v1";
  await engine.applyProposal(proposal.id, proposal.baseHash, "op-apply");
  await engine.settle();
  const parent = store.getRun(run.id)!;
  assert.equal(parent.state, "failed");
  assert.match(parent.stateReason ?? "", /next round could not start: .*endpoint changed/);
  assert.equal(endpoint.requests.length, 1); // only round one; no request to the old or new endpoint
  assert.equal(store.listRuns(spec.id).filter((child) => child.parentRunId === run.id).length, 0);
});

test("a first-ever ad hoc apply pins the configured goldfish reviewer", async () => {
  const calls: (string | null)[] = [];
  const currentReviewer = async (threadId: string | null) => {
    calls.push(threadId);
    return { engine: "goldfish" as const, provider: "http://fake/v1", model: "pinned-model", environmentId: null };
  };
  const { engine, spec, store } = await setup([], { currentReviewer });
  const content = "# Spec\n\nAd hoc change.\n";
  const proposal = await engine.propose(spec.id, [], content, "change", "author-thread");
  await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-pin");
  await engine.settle();
  assert.deepEqual(calls, ["author-thread"]);
  const task = store.getAdHocReviewTask(proposal.id)!;
  assert.deepEqual(task.options.reviewer, { engine: "goldfish", provider: "http://fake/v1", model: "pinned-model", environmentId: null });
  const run = store.listRuns(spec.id)[0]!;
  assert.equal(run.engine, "goldfish");
  assert.equal(run.provider, "http://fake/v1");
  assert.equal(run.model, "pinned-model");
});

test("a first-ever ad hoc apply with BB selected launches BB only with consent", async () => {
  const bb = fakeBb(["NO FINDINGS"]);
  const currentReviewer = async () => ({ engine: "bb" as const, provider: null, model: null, environmentId: null });
  const refused = await setup([], { bb: bb.reviewer, currentReviewer });
  const proposal = await refused.engine.propose(refused.spec.id, [], "# Spec\n\nAd hoc.\n", "change", "thr");
  await refused.engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-bb-refused");
  await refused.engine.settle();
  assert.deepEqual(refused.store.listRuns(refused.spec.id), []);
  assert.equal(bb.launches.length, 0);
  assert.ok(refused.store.listEvents(refused.spec.id).some((e) => e.kind === "proposal.review_failed" && /consent/.test(e.message)));

  const allowed = await setup([], { bb: bb.reviewer, currentReviewer });
  allowed.store.grantReviewerConsent();
  const second = await allowed.engine.propose(allowed.spec.id, [], "# Spec\n\nAd hoc two.\n", "change", "thr");
  await allowed.engine.applyProposal(second.id, second.baseHash, "ad-hoc-bb-allowed");
  await allowed.engine.settle();
  const run = allowed.store.listRuns(allowed.spec.id)[0]!;
  assert.equal(run.engine, "bb");
  assert.ok(allowed.store.getAdHocReviewTask(second.id)!.runId);
  assert.equal(bb.launches.length, 5);
});

test("an ad hoc apply on a spec with a prior run reuses that run's reviewer without consulting settings", async () => {
  const calls: (string | null)[] = [];
  const currentReviewer = async (threadId: string | null) => {
    calls.push(threadId);
    return { engine: "bb" as const, provider: null, model: null, environmentId: null };
  };
  const { engine, spec, store, review } = await setup([{ content: "NO FINDINGS" }], { currentReviewer });
  const prior = await review("implementation");
  const proposal = await engine.propose(spec.id, [], "# Spec\n\nIndependent.\n", "change", "thr");
  await engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-prior");
  await engine.settle();
  assert.deepEqual(calls, []);
  const fresh = store.listRuns(spec.id).find((run) => run.id !== prior.id)!;
  assert.equal(fresh.engine, prior.engine);
  assert.deepEqual(store.getAdHocReviewTask(proposal.id)!.options.reviewer, { engine: prior.engine, provider: prior.provider, model: prior.model, environmentId: prior.environmentId ?? null });
});

test("a reviewer snapshot failure aborts the ad hoc apply before any mutation", async () => {
  const { root, engine, spec, store } = await setup([], { currentReviewer: async () => { throw new Error("settings unavailable"); } });
  const proposal = await engine.propose(spec.id, [], "# Spec\n\nAd hoc.\n", "change", "thr");
  await assert.rejects(engine.applyProposal(proposal.id, proposal.baseHash, "ad-hoc-snapshot-fail"), /settings unavailable/);
  assert.equal(store.getProposal(proposal.id)!.state, "proposed");
  assert.deepEqual(store.listApplyIntents(), []);
  assert.deepEqual(store.listPendingAdHocReviewTasks(), []);
  assert.deepEqual(store.listRuns(spec.id), []);
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), "# Spec\n\nFirst version.\n");
});

test("a crash after the intent still starts the pinned engine even after settings flip to BB", async () => {
  const bb = fakeBb(["NO FINDINGS"]);
  const { root, engine, spec, store } = await setup([], { bb: bb.reviewer, currentReviewer: async () => ({ engine: "bb" as const, provider: null, model: null, environmentId: null }) });
  const content = "# Spec\n\nRecovered ad hoc change.\n";
  const proposal = await engine.propose(spec.id, [], content, "change", "thr");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/ad-hoc-backup");
  await fs.copyFile(target, backup);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/ad-hoc-staged"), baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now(), operationId: "ad-hoc-crash", reviewer: { engine: "goldfish", provider: "http://fake/v1", model: "crash-model", environmentId: null } });
  assert.deepEqual(store.listApplyIntents()[0]!.reviewer, { engine: "goldfish", provider: "http://fake/v1", model: "crash-model", environmentId: null });
  await fs.writeFile(target, content);
  await engine.reconcile();
  await engine.settle();
  const run = store.listRuns(spec.id)[0]!;
  assert.equal(run.engine, "goldfish");
  assert.equal(run.model, "crash-model");
  assert.equal(bb.launches.length, 0);
  assert.deepEqual(store.listApplyIntents(), []);
});

test("a legacy intent without a reviewer snapshot resolves one at reconciliation", async () => {
  const calls: (string | null)[] = [];
  const currentReviewer = async (threadId: string | null) => {
    calls.push(threadId);
    return { engine: "goldfish" as const, provider: "http://fake/v1", model: "legacy-model", environmentId: null };
  };
  const { root, engine, spec, store } = await setup([], { currentReviewer });
  const content = "# Spec\n\nLegacy recovered change.\n";
  const proposal = await engine.propose(spec.id, [], content, "change", "legacy-thread");
  const target = path.join(root, "docs/spec.md");
  const backup = path.join(root, "docs/legacy-backup");
  await fs.copyFile(target, backup);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: backup, stagedPath: path.join(root, "docs/legacy-staged"), baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: Date.now(), operationId: "legacy-intent" });
  await fs.writeFile(target, content);
  await engine.reconcile();
  await engine.settle();
  assert.deepEqual(calls, ["legacy-thread"]);
  const run = store.listRuns(spec.id)[0]!;
  assert.equal(run.engine, "goldfish");
  assert.equal(run.model, "legacy-model");
  assert.deepEqual(store.getAdHocReviewTask(proposal.id)!.options.reviewer, { engine: "goldfish", provider: "http://fake/v1", model: "legacy-model", environmentId: null });
});

test("a legacy pending ad hoc task without a reviewer refuses to start instead of guessing", async () => {
  const { root, engine, spec, store } = await setup([]);
  const content = "# Spec\n\nLegacy task.\n";
  const proposal = await engine.propose(spec.id, [], content, "change", "thr");
  await fs.writeFile(path.join(root, "docs/spec.md"), content);
  store.setProposalState(proposal.id, ["proposed"], "applied", "legacy", { appliedAt: Date.now() });
  store.putAdHocReviewTask({ proposalId: proposal.id, targetHash: sha256(content), options: { preset: "full", context: [], maxRounds: 3, threadId: null }, createdAt: Date.now() });
  await assert.rejects(engine.startRun(spec.id, store.getAdHocReviewTask(proposal.id)!.options, null, proposal.id), /recorded without a reviewer engine/);
  await engine.reconcile();
  await engine.settle();
  assert.deepEqual(store.listRuns(spec.id), []);
  assert.ok(store.listEvents(spec.id).some((e) => e.kind === "proposal.review_failed" && /recorded without a reviewer engine/.test(e.message)));
});
