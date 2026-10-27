import assert from "node:assert/strict";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { BbReviewer } from "./bb-reviewer.ts";

type TurnCompletedData = { status: "completed" | "failed" | "interrupted"; error?: { message: string } };
type EventRow = { type: string; data: TurnCompletedData };
type SpawnRequest = { projectId: string };

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
    projectId: "project-1", environmentId: null, provider: null, model: null,
    onWorkerThread: (id) => workers.push(id),
  });
  assert.deepEqual(workers, ["worker-1"]);
  assert.equal(calls.spawn[0]?.projectId, "project-1");
  assert.equal(result.ok, true);
  assert.deepEqual(calls.output, ["worker-1"]);
  assert.deepEqual(calls.stop, []);
  assert.deepEqual(calls.archive, ["worker-1"]);
});
test("BB reviewer rejects a failed terminal turn, never reads output, then stops and archives it", async () => {

  const { bb, calls } = bbFixture({ type: "turn/completed", data: { status: "failed", error: { message: "provider failed" } } });
  const reviewer = new BbReviewer(bb, async () => 1_000);
  const result = await reviewer.complete([{ role: "user", content: "review this" }], new AbortController().signal, {
    projectId: "project-1", environmentId: null, provider: null, model: null,
  });
  assert.deepEqual(result, { ok: false, kind: "failed", error: "provider failed" });
  assert.deepEqual(calls.output, []);
  assert.deepEqual(calls.stop, ["worker-1"]);
  assert.deepEqual(calls.archive, ["worker-1"]);
});
