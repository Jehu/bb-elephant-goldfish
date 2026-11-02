import assert from "node:assert/strict";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { BbReviewer } from "./bb-reviewer.ts";
import { presetStages, reviewGuidelines, stageMessages } from "./prompts.ts";

type TurnCompletedData = { status: "completed" | "failed" | "interrupted"; error?: { message: string } };
type EventRow = { type: string; data: TurnCompletedData };
type SpawnRequest = { projectId: string; environment: { type: string; environmentId: string }; input: { type: string; text: string }[] };

test("BB passes the comprehension prompt and structured response unchanged", async () => {
  const output = JSON.stringify({ paraphrase: { proposal: "Use a queue.", existingSystem: "Calls run inline." }, findings: [] });
  const { bb, calls } = bbFixture({ type: "turn/completed", data: { status: "completed" } }, output);
  const messages = stageMessages({ plan: presetStages("full", undefined, undefined)[1]!, mode: "REVIEW",
    specPath: "spec.md", specContent: "# Queue", context: [], earlierReports: [] });
  const result = await new BbReviewer(bb, async () => 1000).complete(messages, new AbortController().signal,
    { projectId: "p", environmentId: "env", provider: null, model: null });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.text, output);
  assert.equal(calls.spawn[0]!.input[0]!.text, messages.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n"));
  assert.doesNotMatch(messages[0]!.content, /## Document standard/);
});

test("a BB timeout is a limit with no invented report and cleans up its worker", async () => {
  const { bb, calls } = bbFixture(null);
  const result = await new BbReviewer(bb, async () => 1000).complete([], new AbortController().signal,
    { projectId: "p", environmentId: "env", provider: null, model: null });
  assert.deepEqual(result, { ok: false, kind: "limit", error: "BB worker timed out" });
  assert.deepEqual(calls.output, []);
  assert.deepEqual(calls.stop, ["worker-1"]);
  assert.deepEqual(calls.archive, ["worker-1"]);
});

function bbFixture(event: EventRow | null, output = "NO FINDINGS") {
  const calls: { spawn: SpawnRequest[]; stop: string[]; archive: string[]; output: string[] } = { spawn: [], stop: [], archive: [], output: [] };
  const bb = {
    sdk: {
      threads: {
        spawn: async (request: SpawnRequest) => { calls.spawn.push(request); return { id: "worker-1" }; },
        events: { wait: async () => event },
        output: async ({ threadId }: { threadId: string }) => { calls.output.push(threadId); return { output }; },
        stop: async ({ threadId }: { threadId: string }) => { calls.stop.push(threadId); },
        archive: async ({ threadId }: { threadId: string }) => { calls.archive.push(threadId); },
      },
    },
  };
  return { bb: bb as unknown as BbPluginApi, calls };
}
test("BB reviewer binds a spawned worker to the run project and persists its ID before waiting", async () => {

  const { bb, calls } = bbFixture({ type: "turn/completed", data: { status: "completed" } });
  const reviewer = new BbReviewer(bb, async () => 1_000);
  const workers: string[] = [];
  const result = await reviewer.complete([{ role: "user", content: "review this" }], new AbortController().signal, {
    projectId: "project-1", environmentId: "worktree-a", provider: null, model: null,
    onWorkerThread: (id) => workers.push(id),
  });
  assert.deepEqual(workers, ["worker-1"]);
  assert.equal(calls.spawn[0]?.projectId, "project-1");
  assert.deepEqual(calls.spawn[0]?.environment, { type: "reuse", environmentId: "worktree-a" });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.output, ["worker-1"]);
  assert.deepEqual(calls.stop, []);
  assert.deepEqual(calls.archive, ["worker-1"]);
});
test("BB reviewer rejects a failed terminal turn, never reads output, then stops and archives it", async () => {

  const { bb, calls } = bbFixture({ type: "turn/completed", data: { status: "failed", error: { message: "provider failed" } } });
  const reviewer = new BbReviewer(bb, async () => 1_000);
  const result = await reviewer.complete([{ role: "user", content: "review this" }], new AbortController().signal, {
    projectId: "project-1", environmentId: "worktree-a", provider: null, model: null,
  });
  assert.deepEqual(result, { ok: false, kind: "failed", error: "provider failed" });
  assert.deepEqual(calls.output, []);
  assert.deepEqual(calls.stop, ["worker-1"]);
  assert.deepEqual(calls.archive, ["worker-1"]);
});

test("BB reviewers never fall back to the project default when the checkout is absent", async () => {
  const { bb, calls } = bbFixture(null);
  const result = await new BbReviewer(bb, async () => 1_000).complete([], new AbortController().signal, {
    projectId: "project-1", environmentId: null, provider: null, model: null,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls.spawn, []);
});

test("BB worker receives the same guideline and historical context messages", async () => {
  const { bb, calls } = bbFixture({ type: "turn/completed", data: { status: "completed" } });
  const messages = stageMessages({ plan: { lens: "structural", standard: "feature-spec-standard" },
    mode: "REVIEW", specPath: "spec.md", specContent: "# Spec", context: [], earlierReports: [],
    reviewContext: { runId: "r", currentHash: "current", decisions: [], decisionBudget: 32000,
      omittedDecisions: 1, omissionReason: "Decision character budget", contextNotes: ["context file missing: source.md"] } });
  await new BbReviewer(bb, async () => 1000).complete(messages, new AbortController().signal, {
    projectId: "p", environmentId: "env", provider: null, model: null });
  assert.equal(calls.spawn[0]!.input[0]!.text, messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n"));
  assert.ok(calls.spawn[0]!.input[0]!.text.includes(reviewGuidelines));
  assert.match(calls.spawn[0]!.input[0]!.text, /source\.md/);
});
