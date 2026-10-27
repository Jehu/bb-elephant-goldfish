import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { GoldfishMessage, GoldfishResult } from "./goldfish.ts";
import type { ReviewerCall } from "./engine.ts";
import type { ReviewerStatus } from "./contract.ts";

/** Fresh BB worker adapter. BB exposes no read-only or sandboxed worker mode. */
export class BbReviewer {
  readonly engine = "bb" as const;
  private readonly bb: BbPluginApi;
  private readonly timeoutMs: () => Promise<number>;
  constructor(bb: BbPluginApi, timeoutMs: () => Promise<number>) {
    this.bb = bb;
    this.timeoutMs = timeoutMs;
  }

  async status(): Promise<ReviewerStatus> {
    return { engine: "bb", ready: true, reason: null, model: null, endpoint: null };
  }

  async cleanupWorker(threadId: string): Promise<void> {
    await this.bb.sdk.threads.stop({ threadId }).catch(() => undefined);
    await this.bb.sdk.threads.archive({ threadId }).catch(() => undefined);
  }

  async complete(messages: GoldfishMessage[], signal: AbortSignal, call: ReviewerCall): Promise<GoldfishResult> {
    const prompt = messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n");
    let threadId: string | null = null;
    let mustStop = false;
    try {
      const spawned = await this.bb.sdk.threads.spawn({
        projectId: call.projectId,
        input: [{ type: "text", text: prompt, mentions: [], visibility: "agent-only" }],
        origin: "plugin",
        environment: call.environmentId ? { type: "reuse", environmentId: call.environmentId } : { type: "project-default" },
        ...(call.provider ? { providerId: call.provider } : {}),
        ...(call.model ? { model: call.model } : {}),
      });
      threadId = spawned.id;
      call.onWorkerThread?.(threadId);
      const timeoutMs = await this.timeoutMs();
      const timeout = AbortSignal.timeout(timeoutMs);
      const event = await this.bb.sdk.threads.events.wait({ threadId, type: "turn/completed", waitMs: String(timeoutMs), signal: AbortSignal.any([signal, timeout]) });
      const terminal = event?.type === "turn/completed" ? event.data : null;
      if (!terminal) {
        mustStop = true;
        return { ok: false, kind: signal.aborted ? "cancelled" : "limit", error: signal.aborted ? "cancelled" : "BB worker timed out" };
      }
      if (terminal.status !== "completed") {
        mustStop = true;
        return { ok: false, kind: signal.aborted ? "cancelled" : "failed", error: signal.aborted ? "cancelled" : terminal.error?.message ?? `BB worker turn ${terminal.status}` };
      }
      const output = (await this.bb.sdk.threads.output({ threadId })).output?.trim();
      if (!output) return { ok: false, kind: "failed", error: "BB worker completed without a report" };
      return { ok: true, text: output, model: call.model ?? "BB worker", truncated: false };
    } catch (cause) {
      mustStop = true;
      return { ok: false, kind: signal.aborted ? "cancelled" : "failed", error: signal.aborted ? "cancelled" : (cause instanceof Error ? cause.message : String(cause)) };
    } finally {
      if (threadId) {
        if (mustStop || signal.aborted) await this.cleanupWorker(threadId);
        else await this.bb.sdk.threads.archive({ threadId }).catch(() => undefined);
      }
    }
  }
}
