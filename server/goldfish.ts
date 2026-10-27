// Goldfish reviewers: single-turn, tool-less chat completions against an
// OpenAI-compatible endpoint. Fresh context and read-only access hold by
// construction: each call carries only the persona, standard and the
// material the plugin read itself; the request declares no tools, and a
// response that tries to call one is rejected rather than trusted.
//
// BB threads are not used for Goldfish: every installed provider offers
// only accept-edits/full permission modes, so a thread could write.
import { z } from "zod";
import type { ReviewerStatus } from "./contract.ts";

const completionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.unknown().optional(), tool_calls: z.unknown().optional() }).optional(),
        finish_reason: z.unknown().optional(),
      }),
    )
    .optional(),
});

export type GoldfishConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
};


export type GoldfishMessage = { role: "system" | "user"; content: string };

export type GoldfishResult =
  | { ok: true; text: string; model: string; truncated: boolean }
  | { ok: false; error: string; kind: "cancelled" | "limit" | "failed" };

export class GoldfishClient {
  readonly engine = "goldfish" as const;
  private readonly config: () => Promise<GoldfishConfig | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(config: () => Promise<GoldfishConfig | null>, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async status(): Promise<ReviewerStatus> {
    const config = await this.config();
    if (config === null) {
      return { engine: "goldfish", ready: false, reason: "No Advanced Goldfish endpoint is configured.", model: null, endpoint: null };
    }
    try {
      const res = await this.fetchImpl(`${config.baseUrl}/models`, { headers: { authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { engine: "goldfish", ready: false, reason: `The reviewer endpoint answered HTTP ${res.status}.`, model: config.model, endpoint: config.baseUrl };
      return { engine: "goldfish", ready: true, reason: null, model: config.model, endpoint: config.baseUrl };
    } catch (cause) {
      return { engine: "goldfish", ready: false, reason: `The reviewer endpoint cannot be reached: ${(cause as Error).message}`, model: config.model, endpoint: config.baseUrl };
    }
  }

  async complete(messages: GoldfishMessage[], signal: AbortSignal, call?: { provider: string | null; model: string | null }): Promise<GoldfishResult> {
    const liveConfig = await this.config();
    if (liveConfig === null) return { ok: false, kind: "failed", error: "no Goldfish endpoint is configured" };
    const config = call?.provider && call.model ? { ...liveConfig, baseUrl: call.provider, model: call.model } : liveConfig;
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    let res: Response;
    try {
      res = await this.fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        // No `tools`, no `functions`, no `tool_choice`: the reviewer cannot act.
        body: JSON.stringify({ model: config.model, messages, temperature: 0.2, stream: false }),
        signal: combined,
      });
    } catch (cause) {
      if (signal.aborted) return { ok: false, kind: "cancelled", error: "cancelled" };
      if (timeout.aborted) return { ok: false, kind: "limit", error: `no answer within ${Math.round(config.timeoutMs / 1000)} s` };
      return { ok: false, kind: "failed", error: `request failed: ${(cause as Error).message}` };
    }
    if (res.status === 429) return { ok: false, kind: "limit", error: "the reviewer endpoint rate-limited the request (HTTP 429)" };
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, kind: "failed", error: `the reviewer endpoint answered HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: "failed", error: "the reviewer endpoint returned something that is not JSON" };
    }
    const parsed = completionSchema.safeParse(body);
    if (!parsed.success) return { ok: false, kind: "failed", error: "the reviewer endpoint returned an unexpected response shape" };
    const choice = parsed.data.choices?.[0];
    if (!choice?.message) return { ok: false, kind: "failed", error: "the reviewer endpoint returned no message" };
    const toolCalls = choice.message.tool_calls;
    if (choice.finish_reason === "tool_calls" || (Array.isArray(toolCalls) && toolCalls.length > 0)) {
      return { ok: false, kind: "failed", error: "the reviewer tried to call a tool; its answer was discarded" };
    }
    const content = choice.message.content;
    if (typeof content !== "string" || content.trim() === "") {
      return { ok: false, kind: "failed", error: "the reviewer returned an empty report" };
    }
    const model = parsed.data.model ?? config.model;
    return { ok: true, text: content, model, truncated: choice.finish_reason === "length" };
  }
}
