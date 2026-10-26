import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { Engine } from "./engine.ts";
import { GoldfishClient } from "./goldfish.ts";
import { MIGRATIONS, Store } from "./store.ts";
import { sha256 } from "./workspace.ts";

/**
 * Regression tests for the partial-running findings guard: while a review run
 * is still executing (one stage answered, the next hanging), its findings are
 * already durable, and decisions, proposals and applies touching them must be
 * refused through the engine's public surface.
 */
type Reply = { content?: string; status?: number; toolCall?: boolean; hang?: boolean; gate?: Promise<void> };

function fakeEndpoint(replies: Reply[]) {
  const requests: { model: string; messages: { role: string; content: string }[] }[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith("/models")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    requests.push(JSON.parse(String(init?.body)));
    for (const w of waiters.filter((w) => requests.length >= w.n)) w.resolve();
    const reply = replies.shift() ?? { content: "NO FINDINGS" };
    if (reply.hang) {
      const aborted = Promise.withResolvers<never>();
      init?.signal?.addEventListener("abort", () => aborted.reject(new DOMException("aborted", "AbortError")));
      return aborted.promise;
    }
    const message = { content: reply.content };
    return new Response(
      JSON.stringify({ model: "fake-model", choices: [{ message, finish_reason: "stop" }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  const requestCount = (n: number): Promise<void> => {
    if (requests.length >= n) return Promise.resolve();
    const { promise, resolve } = Promise.withResolvers<void>();
    waiters.push({ n, resolve });
    return promise;
  };
  return { fetchImpl, requests, requestCount };
}

const FINDING = (title: string, severity = "major") => `### FINDING\nseverity: ${severity}\nlines: 1-2\ntitle: ${title}\nBecause reasons.\n`;

async function setup(replies: Reply[]) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "egm-guards-")));
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.writeFile(path.join(root, "docs/spec.md"), "# Spec\n\nFirst version.\n");
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const statement of MIGRATIONS) db.exec(statement);
  const store = new Store(db);
  const endpoint = fakeEndpoint(replies);
  const engine = new Engine({
    store,
    goldfish: new GoldfishClient(
      async () => ({ baseUrl: "http://fake/v1", model: "m", apiKey: "k", timeoutMs: 5000 }),
      endpoint.fetchImpl,
    ),
    projectRoot: async () => root,
    changed: () => {},
    log: { info: () => {}, warn: () => {} },
  });
  const spec = await engine.registerSpec("proj", "docs/spec.md");
  return { root, store, engine, spec, endpoint };
}

/**
 * A `feature_spec` review whose first stage answers with a finding while the
 * second stage hangs: the run stays `running` with the finding already stored.
 */
async function runningRunWithFinding() {
  const ctx = await setup([{ content: FINDING("Gap A") }, { hang: true }]);
  const run = await ctx.engine.startRun(ctx.spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
  await ctx.endpoint.requestCount(2);
  assert.equal(ctx.store.getRun(run.id)!.state, "running");
  const [finding] = ctx.store.listFindingsForRun(run.id);
  assert.ok(finding, "the answered stage already stored its finding");
  return { ...ctx, run, finding: finding! };
}

test("forgetting a spec with a running review is refused without losing its findings", async () => {
  const { engine, spec, store, run, finding } = await runningRunWithFinding();
  await assert.rejects(engine.forgetSpec(spec.id), /Wait until the review finishes/);
  assert.ok(store.getSpec(spec.id));
  assert.equal(store.getRun(run.id)!.state, "running");
  assert.equal(store.getFinding(finding.id)!.state, "open");
  engine.cancelRun(run.id);
  await engine.settle();
  assert.equal(await engine.forgetSpec(spec.id), true);
});

test("deciding a finding of a running review is refused and records nothing", async () => {
  const { engine, store, run, finding } = await runningRunWithFinding();
  await assert.rejects(engine.decide(finding.id, "dismiss", "", "human", "op-running-decide"), /Wait until the review finishes/);
  assert.equal(store.getFinding(finding.id)!.state, "open");
  assert.equal(store.getOperation("op-running-decide"), null);
  assert.equal(store.getRun(run.id)!.state, "running");
  engine.cancelRun(run.id);
  await engine.settle();
});

test("proposing changes to findings of a running review is refused without side effects", async () => {
  const { engine, spec, store, run, finding } = await runningRunWithFinding();
  await assert.rejects(
    engine.propose(spec.id, [finding.id], "# Spec\n\nSecond version.\n", "fix", "thr"),
    /Wait until the review finishes before proposing/,
  );
  assert.deepEqual(store.listProposals(spec.id), []);
  assert.equal(store.getFinding(finding.id)!.state, "open");
  assert.equal(store.getRun(run.id)!.state, "running");
  engine.cancelRun(run.id);
  await engine.settle();
});

test("proposing with no findings is refused without side effects", async () => {
  const { engine, spec, store, run, finding } = await runningRunWithFinding();
  await assert.rejects(engine.propose(spec.id, [], "# Spec\n\nSecond version.\n", "fix", "thr"));
  assert.deepEqual(store.listProposals(spec.id), []);
  assert.equal(store.getFinding(finding.id)!.state, "open");
  assert.equal(store.getRun(run.id)!.state, "running");
  engine.cancelRun(run.id);
  await engine.settle();
});

test("applying a proposal whose findings belong to a running review is refused without side effects", async () => {
  const { root, engine, spec, store } = await setup([{ content: FINDING("Gap A") }]);
  const run = await engine.startRun(spec.id, { preset: "feature_spec", context: [], maxRounds: 3, threadId: null });
  await engine.settle();
  assert.equal(store.getRun(run.id)!.state, "awaiting_decisions");
  const [finding] = store.listFindingsForRun(run.id);
  const proposal = await engine.propose(spec.id, [finding!.id], "# Spec\n\nSecond version.\n", "fix", "thr");
  // The real window this guards: findings are durable while their run is still executing.
  assert.ok(store.setRunState(run.id, ["awaiting_decisions"], "running", "stage answered; next stage in flight", false));
  await assert.rejects(engine.applyProposal(proposal.id, proposal.baseHash, "op-running-apply"), /Wait until the review finishes before applying/);
  assert.equal(await fs.readFile(path.join(root, "docs/spec.md"), "utf8"), "# Spec\n\nFirst version.\n");
  assert.equal(store.getProposal(proposal.id)!.state, "proposed");
  assert.equal(store.getFinding(finding!.id)!.state, "proposal_pending");
  assert.deepEqual(store.listApplyIntents(), []);
  assert.equal(store.getOperation("op-running-apply"), null);
});

test("reconciliation retains an orphan intent and its files without recording an apply", async () => {
  const { root, engine, store, spec } = await setup([{ content: FINDING("Gap A") }]);
  const run = await engine.startRun(spec.id, { preset: "implementation", context: [], maxRounds: 1, threadId: null });
  await engine.settle();
  const [finding] = store.listFindingsForRun(run.id);
  const content = "# Spec\n\nProposed version.\n";
  const proposal = await engine.propose(spec.id, [finding!.id], content, "fix", "thr");
  const target = path.join(root, "docs/spec.md");
  const orphanTarget = path.join(root, "docs/orphan-target");
  const backup = path.join(root, "docs/orphan-backup");
  const staged = path.join(root, "docs/orphan-staged");
  await fs.writeFile(orphanTarget, "orphan target");
  await fs.writeFile(backup, "orphan backup");
  await fs.writeFile(staged, "orphan staged");
  const intent = { proposalId: "missing-proposal", targetPath: orphanTarget, backupPath: backup, stagedPath: staged, baseHash: "base", resultHash: "result", createdAt: 1, operationId: "orphan-apply" };
  store.putApplyIntent(intent);
  const normalBackup = path.join(root, "docs/normal-backup");
  const normalStaged = path.join(root, "docs/normal-staged");
  await fs.copyFile(target, normalBackup);
  await fs.writeFile(target, content);
  await fs.writeFile(normalStaged, content);
  store.putApplyIntent({ proposalId: proposal.id, targetPath: target, backupPath: normalBackup, stagedPath: normalStaged, baseHash: proposal.baseHash, resultHash: sha256(content), createdAt: 2, operationId: "normal-apply" });

  await engine.reconcile();
  assert.deepEqual(store.listApplyIntents(), [intent]);
  assert.equal(store.getOperation("orphan-apply"), null);
  assert.ok(store.getOperation("normal-apply"));
  assert.equal(store.getProposal(proposal.id)!.state, "applied");
  assert.equal(store.getFinding(finding!.id)!.state, "fixed");
  assert.equal(await fs.readFile(orphanTarget, "utf8"), "orphan target");
  assert.equal(await fs.readFile(backup, "utf8"), "orphan backup");
  assert.equal(await fs.readFile(staged, "utf8"), "orphan staged");
});
