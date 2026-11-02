// Elephant Goldfish — BB plugin backend.
//
// Surfaces:
// - RPC for the project page and the thread tab (server/contract.ts).
// - Agent tools for the Elephant (the thread working with the human):
//   register specs, start reviews, read findings, contest, propose.
//   Deciding findings and applying proposals are human-only (RPC from the UI).
// - Skills in skills/ adapt the seven upstream EGM skills to these tools.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  CHANGED_CHANNEL,
  LENS_IDS,
  PRESET_IDS,
  STANDARD_IDS,
  rpcContract,
  type Run,
  type Checkout,
  type Spec,
} from "./server/contract.ts";
import { Engine, EngineError } from "./server/engine.ts";
import { BbReviewer } from "./server/bb-reviewer.ts";
import { GoldfishClient, normalizeBaseUrl } from "./server/goldfish.ts";
import { checkoutKey, MIGRATIONS, Store, type SpecRecord } from "./server/store.ts";
import { Checkouts } from "./server/checkouts.ts";
import { resolveInside, WorkspaceError } from "./server/workspace.ts";
import { egmLink, type EgmTarget } from "./lib/egm-links.ts";
import { reviewGuidelines } from "./server/prompts.ts";

export { rpcContract };
export type * from "./server/contract.ts";

const ELEPHANT_TOOLS = ["egm_specs", "egm_register_spec", "egm_start_review", "egm_review_status", "egm_contest", "egm_propose"];
/** Frontmatter names of skills/<dir>/SKILL.md; configure() must select them explicitly. */
const SKILL_NAMES = ["egm-brainstorm", "egm-draft", "egm-review", "egm-review-loop", "egm-resolve", "egm-drift-report", "egm-bootstrap"];

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    reviewerEngine: {
      type: "select",
      label: "Reviewer engine",
      description: "BB workers (default) can use tools and write according to BB permissions. Advanced endpoint is tool-less.",
      default: "bb",
      options: ["bb", "goldfish"],
    },
    goldfishBaseUrl: {
      type: "string",
      label: "Goldfish endpoint",
      description: "OpenAI-compatible base URL for reviewer calls, e.g. http://127.0.0.1:20128/v1. It is shown in the UI and reports, so do not embed credentials. Reviewers get no tools.",
      default: "",
    },
    goldfishModel: {
      type: "string",
      label: "Goldfish model",
      description: "Model id sent to the endpoint.",
      default: "",
    },
    goldfishApiKey: {
      type: "string",
      label: "Goldfish API key",
      description: "Bearer token for the endpoint. Leave empty to read it from the environment variable named below.",
      secret: true,
    },
    goldfishApiKeyEnv: {
      type: "string",
      label: "API key environment variable",
      description: "Read the key from this environment variable of the BB server when the key field is empty.",
      default: "",
    },
    goldfishTimeoutSeconds: {
      type: "number",
      label: "Reviewer timeout (seconds)",
      default: 300,
    },
  });

  const db = bb.storage.database();
  // SQLite cannot replace a referenced table with FK enforcement enabled
  // inside migrate's transaction. Restore enforcement even when migration fails.
  db.pragma("foreign_keys = OFF");
  try { bb.storage.migrate(db, MIGRATIONS); }
  finally { db.pragma("foreign_keys = ON"); }
  if ((db.pragma("foreign_key_check") as unknown[]).length) throw new Error("EGM database has invalid foreign keys after migration.");
  const store = new Store(db);
  const checkouts = new Checkouts(bb);

  const goldfish = new GoldfishClient(async () => {
    const value = await settings.get();
    const baseUrl = normalizeBaseUrl(String(value.goldfishBaseUrl ?? ""));
    const model = String(value.goldfishModel ?? "").trim();
    const keyEnv = String(value.goldfishApiKeyEnv ?? "").trim();
    const apiKey = String(value.goldfishApiKey ?? "").trim() || (keyEnv ? process.env[keyEnv] ?? "" : "");
    if (!baseUrl || !model || !apiKey) return null;
    return { baseUrl, model, apiKey, timeoutMs: Math.max(10, Number(value.goldfishTimeoutSeconds ?? 300)) * 1000 };
  });
  const bbReviewer = new BbReviewer(bb, async () => Math.max(10, Number((await settings.get()).goldfishTimeoutSeconds ?? 300)) * 1000);
  const reviewer = async () => ((await settings.get()).reviewerEngine === "goldfish" ? goldfish : bbReviewer);
  const snapshotReviewer = async () => {
    const selected = await reviewer();
    if (selected.engine === "goldfish") {
      const value = await settings.get();
      const baseUrl = normalizeBaseUrl(String(value.goldfishBaseUrl ?? ""));
      const model = String(value.goldfishModel ?? "").trim();
      return { engine: "goldfish" as const, provider: baseUrl || null, model: model || null, environmentId: null };
    }
    return { engine: "bb" as const, provider: null, model: null, environmentId: null };
  };

  const changed = (projectId: string, specId: string | null) => bb.realtime.publish(CHANGED_CHANNEL, { projectId, specId });

  const engine = new Engine({ store, goldfish, reviewer: () => bbReviewer, currentReviewer: snapshotReviewer, threadProject: async (threadId) => (await bb.sdk.threads.get({ threadId })).projectId, checkoutRoot: (projectId, checkout) => checkouts.validate(projectId, checkout), changed, log: bb.log });
  await engine.reconcile();

  const describeAll = async (projectId: string, checkout?: Checkout | null): Promise<Spec[]> => {
    const out: Spec[] = [];
    for (const record of store.listSpecs(projectId)) {
      if (checkout && record.checkout && checkoutKey(record.checkout) !== checkoutKey(checkout)) continue;
      out.push((await engine.describeSpec(record)).spec);
    }
    return out;
  };

  const requireProjectSpec = (specId: string, projectId: string) => {
    const spec = store.getSpec(specId);
    if (!spec || spec.projectId !== projectId) throw new EngineError("Unknown spec.");
    return spec;
  };

  const requireThreadSpec = async (specId: string, projectId: string, threadId: string): Promise<SpecRecord> => {
    const spec = requireProjectSpec(specId, projectId);
    const checkout = await checkouts.thread(projectId, threadId);
    if (!spec.checkout || checkoutKey(spec.checkout) !== checkoutKey(checkout)) {
      throw new EngineError("This spec belongs to a different checkout or needs an explicit checkout assignment. Use a thread in its checkout.");
    }
    return spec;
  };

  const runsWithStale = async (specId: string): Promise<Run[]> => {
    const record = store.getSpec(specId);
    if (!record) return [];
    const { spec } = await engine.describeSpec(record);
    return store.listRuns(specId).map((run) => engine.withStale(run, spec.currentHash));
  };

  // Turn engine/workspace errors into readable RPC failures.
  const guard = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    try {
      return await fn();
    } catch (cause) {
      if (cause instanceof EngineError || cause instanceof WorkspaceError) throw new Error(cause.message);
      throw cause;
    }
  };


  bb.rpc.register(rpcContract, {
    projects_list: async () => {
      const projects = await bb.sdk.projects.list();
      const out = [];
      for (const project of projects) {
        out.push({ id: project.id, name: project.name, root: (await checkouts.list(project.id))[0]?.root ?? null });
      }
      return { projects: out, current: null };
    },
    consent_status: () => ({ granted: store.hasReviewerConsent(), warning: "BB reviewer workers are not read-only or sandboxed. They can run tools, including writes, subject only to BB's permission mode. Allow this installation to launch them?" }),
    consent_grant: () => {
      store.grantReviewerConsent();
      return { granted: true, warning: "BB reviewer worker consent is recorded for this installation." };
    },
    consent_revoke: () => {
      store.revokeReviewerConsent();
      return { granted: false, warning: "BB reviewer worker consent was revoked; BB launches are refused until allowed again." };
    },
    reviewer_status: async () => (await (await reviewer()).status()),

    specs_list: ({ projectId, threadId }) =>
      guard(async () => {
        const checkout = threadId ? await checkouts.thread(projectId, threadId) : null;
        return { specs: await describeAll(projectId, checkout), root: checkout?.root ?? null };
      }),
    checkouts_list: ({ projectId }) => guard(async () => ({ checkouts: await checkouts.list(projectId) })),
    specs_register: ({ projectId, path, threadId, environmentId }) =>
      guard(async () => {
        if (!threadId && !environmentId) throw new EngineError("Choose a checkout before registering a spec.");
        const checkout = threadId ? await checkouts.thread(projectId, threadId) : await checkouts.environment(projectId, environmentId!);
        if (environmentId && environmentId !== checkout.environmentId) throw new EngineError("Thread and selected checkout do not match.");
        return (await engine.describeSpec(await engine.registerSpec(projectId, path, checkout))).spec;
      }),
    spec_bind_checkout: ({ specId, environmentId }) => guard(async () => {
      const spec = store.getSpec(specId);
      if (!spec) throw new EngineError("Unknown spec.");
      return (await engine.describeSpec(await engine.bindCheckout(specId, await checkouts.environment(spec.projectId, environmentId)))).spec;
    }),
    specs_forget: ({ specId }) => guard(async () => ({ removed: await engine.forgetSpec(specId) })),
    spec_detail: ({ specId }) =>
      guard(async () => {
        const record = store.getSpec(specId);
        if (!record) throw new EngineError("Unknown spec.");
        const { spec, content } = await engine.describeSpec(record);
        return {
          spec,
          content,
          runs: store.listRuns(specId).map((run) => engine.withStale(run, spec.currentHash)),
          stages: store.listStagesForSpec(specId),
          findings: store.listFindings(specId),
          proposals: store.listProposals(specId),
          events: store.listEvents(specId),
        };
      }),
    thread_overview: ({ threadId }) =>
      guard(async () => {
        const thread = await bb.sdk.threads.get({ threadId });
        let workspaceError: string | null = null;
        const checkout = await checkouts.thread(thread.projectId, threadId).catch(cause => {
          workspaceError = cause instanceof Error ? cause.message : String(cause);
          return null;
        });
        const specs = checkout ? await describeAll(thread.projectId, checkout) : [];
        const activeRuns: Run[] = [];
        for (const spec of specs) {
          for (const run of await runsWithStale(spec.id)) {
            if (run.state === "running" || run.state === "awaiting_decisions") activeRuns.push(run);
          }
        }
        return { projectId: thread.projectId, checkout, workspaceError, specs, activeRuns };
      }),
    review_start: (input) =>
        guard(async () => {
          requireProjectSpec(input.specId, input.projectId);
          if (input.threadId) await requireThreadSpec(input.specId, input.projectId, input.threadId);
          const snapshot = await snapshotReviewer();
        return engine.startRun(input.specId, {
          preset: input.preset,
          ...(input.lenses ? { lenses: input.lenses } : {}),
          ...(input.standard ? { standard: input.standard } : {}),
          context: input.context,
          maxRounds: input.maxRounds,
          threadId: input.threadId,
          reviewer: snapshot,
        });
      }),
    review_cancel: ({ runId }) => guard(() => engine.cancelRun(runId)),
    finding_decide: ({ findingId, kind, rationale, opId }) =>
      guard(() => engine.decide(findingId, kind, rationale, "human", opId)),
    proposal_apply: ({ proposalId, baseHash, opId }) => guard(() => engine.applyProposal(proposalId, baseHash, opId)),
    proposal_reject: ({ proposalId, reason }) => guard(() => engine.rejectProposal(proposalId, reason)),
    workspace_search: ({ threadId, query }) =>
      guard(async () => {
        const thread = await bb.sdk.threads.get({ threadId });
        const checkout = await checkouts.thread(thread.projectId, threadId);
        const root = checkout.root;
        const result = await bb.sdk.environments.paths({ environmentId: checkout.environmentId, query, includeFiles: "true", includeDirectories: "false" });
        const paths: string[] = [];
        for (const entry of result.paths) {
          if (entry.kind !== "file" || !entry.path || path.isAbsolute(entry.path)) continue;
          try {
            const absolute = await resolveInside(root, entry.path);
            const stat = await fs.lstat(absolute);
            if (stat.isFile() && !stat.isSymbolicLink()) paths.push(entry.path);
          } catch {
            // A search result may disappear or point outside the authorized checkout.
          }
        }
        return { paths, truncated: result.truncated };
      }),
  }, {
    // Lets `bb plugin rpc call elephant-goldfish <method>` drive the workspace from a terminal or script.
    experimental_discoverable: true,
    experimental_description: "Elephant Goldfish spec workspace: specs, Goldfish reviews, decisions, proposals.",
  });

  // --- Elephant tools ------------------------------------------------------

  const asText = (value: unknown) => JSON.stringify(value, null, 2);
  const toolError = (cause: unknown) => ({
    content: [{ type: "text" as const, text: cause instanceof Error ? cause.message : String(cause) }],
    isError: true,
  });
  const link = (target: EgmTarget) => egmLink(bb.pluginId, target);
  const linkedSpec = (spec: Spec) => ({ ...spec, link: link({ projectId: spec.projectId, specId: spec.id }) });
  const linkInstruction = "Render the returned link.directive exactly once on its own line, outside code fences, so the human can open the exact item in the panel. Opening never confirms a change.";

  bb.agents.registerTool({
    name: "egm_specs",
    description: "List the specs registered in the invoking thread's checkout, including a worktree, with review state and open findings. Registrations in other checkouts have separate IDs and histories.",
    presentation: { label: { pending: "Listing specs", completed: "Listed specs" } },
    parameters: z.object({}),
    async execute(_params, { projectId, threadId }) {
      try {
        const checkout = await checkouts.thread(projectId, threadId);
        return asText({ root: checkout.root, checkout, specs: (await describeAll(projectId, checkout)).map(linkedSpec), next: linkInstruction });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_register_spec",
    description: "Register a Markdown spec relative to the invoking thread's checkout, including a worktree. The spec and its reviews and proposals remain bound to that checkout; the same path in another checkout is a separate registration.",
    presentation: { label: { pending: "Registering spec", completed: "Registered spec" } },
    parameters: z.object({ path: z.string().min(1).max(1024) }),
    async execute({ path }, { projectId, threadId }) {
      try {
        const checkout = await checkouts.thread(projectId, threadId);
        return asText({ ...linkedSpec((await engine.describeSpec(await engine.registerSpec(projectId, path, checkout))).spec), next: linkInstruction });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_start_review",
    description:
      "Start a configured reviewer run. BB workers require recorded human consent because they can use tools; Advanced endpoint mode is tool-less.",
    presentation: { label: { pending: "Starting review", completed: "Started review" } },
    parameters: z.object({
      specId: z.string(),
      preset: z.enum(PRESET_IDS),
      lenses: z.array(z.enum(LENS_IDS)).optional(),
      standard: z.enum(STANDARD_IDS).optional(),
      context: z.array(z.string()).max(20).default([]),
      maxRounds: z.number().int().min(1).max(10).default(3),
    }),
    async execute(params, { projectId, threadId }) {
      try {
        await requireThreadSpec(params.specId, projectId, threadId);
        const snapshot = await snapshotReviewer();
        if (snapshot.engine === "bb" && !store.hasReviewerConsent()) throw new EngineError("BB reviewer consent is required in the Elephant Goldfish tab before launch.");
        const run = await engine.startRun(params.specId, {
          preset: params.preset,
          ...(params.lenses ? { lenses: params.lenses } : {}),
          ...(params.standard ? { standard: params.standard } : {}),
          context: params.context,
          maxRounds: params.maxRounds,
          threadId,
          reviewer: snapshot,
        });
        return asText({ ...run, link: link({ projectId, specId: params.specId }), next: linkInstruction });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_review_status",
    description:
      "Read a spec's review state: runs, stages (including separate comprehension paraphrases and incomplete report text), findings (with ids, severity, state, human decisions) and proposals. Use it to see what the human decided and which findings wait for you.",
    presentation: { label: { pending: "Reading review status", completed: "Read review status" } },
    parameters: z.object({ specId: z.string() }),
    async execute({ specId }, { projectId, threadId }) {
      try {
        const record = await requireThreadSpec(specId, projectId, threadId);
        const { spec } = await engine.describeSpec(record);
        const latest = store.latestRun(specId);
        return asText({
          spec: linkedSpec(spec),
          runs: (await runsWithStale(specId)).slice(0, 5),
          stages: latest ? store.listStages(latest.id) : [],
          reviewContext: engine.reviewContext(specId, latest, spec.currentHash),
          findings: store.listFindings(specId).filter((f) => f.state !== "superseded").slice(0, 100).map((finding) => ({ ...finding, link: link({ projectId, specId, findingId: finding.id }) })),
          proposals: store.listProposals(specId).slice(0, 10).map(({ diff: _diff, ...rest }) => ({ ...rest, link: link({ projectId, specId, proposalId: rest.id }) })),
          next: linkInstruction,
        });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_contest",
    description:
      "As the Elephant, argue that a finding does not apply, with the rationale from your context. This does not resolve it: the human decides in the Elephant Goldfish tab.",
    presentation: { label: { pending: "Contesting finding", completed: "Contested finding" } },
    parameters: z.object({ findingId: z.string(), rationale: z.string().min(1).max(4000) }),
    async execute({ findingId, rationale }, { projectId, threadId }) {
      try {
        const finding = store.getFinding(findingId);
        if (!finding) throw new EngineError("Unknown finding.");
        await requireThreadSpec(finding.specId, projectId, threadId);
        return asText({ ...await engine.contest(findingId, rationale), link: link({ projectId, specId: finding.specId, findingId }), next: linkInstruction });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_propose",
    description:
      "As the Elephant, propose a complete revised spec, either addressing findings or making an agreed ad hoc change. Pass the COMPLETE new document content and findingIds for the findings addressed, or an empty array when there are none; never invent findings. The diff is bound to the current spec snapshot and the human must confirm it before it is written. Never edit the spec file yourself.",
    presentation: { label: { pending: "Proposing a change", completed: "Proposed a change" } },
    parameters: z.object({
      specId: z.string(),
      findingIds: z.array(z.string()).max(100),
      content: z.string().min(1).max(1_500_000),
      summary: z.string().min(1).max(2000),
    }),
    async execute({ specId, findingIds, content, summary }, { projectId, threadId }) {
      try {
        await requireThreadSpec(specId, projectId, threadId);
        const proposal = await engine.propose(specId, findingIds, content, summary, threadId);
        const { diff, ...rest } = proposal;
        return asText({ ...rest, diffLines: diff.split("\n").length, link: link({ projectId, specId, proposalId: proposal.id }), next: `${linkInstruction} Ask the human to inspect and explicitly confirm the diff there.` });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.configure(() => ({ tools: ELEPHANT_TOOLS, skills: SKILL_NAMES, instructions: reviewGuidelines }));

  bb.cli.register({
    name: "egm",
    summary: "Elephant Goldfish spec workspace",
    commands: [
      { name: "status", summary: "Show reviewer availability and this project's specs", usage: "bb egm status" },
    ],
    async run(argv, ctx) {
      const [command] = argv;
      if (command !== "status") {
        return { exitCode: 2, stderr: "usage: bb egm status\n" };
      }
      const status = await (await reviewer()).status();
      const engineLabel = status.engine === "bb" ? "BB workers" : "Advanced endpoint";
      const lines = [`${engineLabel}: ${status.ready ? `ready${status.model ? ` (${status.model}${status.endpoint ? ` at ${status.endpoint}` : ""})` : ""}` : `unavailable: ${status.reason}`}`];
      if (ctx.projectId) {
        for (const spec of await describeAll(ctx.projectId)) {
          lines.push(
            `${spec.path}  ${spec.latestRun ? `${spec.latestRun.state}${spec.latestRun.stale ? " (stale)" : ""}` : "not reviewed"}  open findings: ${spec.openFindings}`,
          );
        }
      }
      return { exitCode: 0, stdout: lines.join("\n") + "\n" };
    },
  });

  bb.onDispose(() => engine.dispose());
}
