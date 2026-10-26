// Elephant Goldfish — BB plugin backend.
//
// Surfaces:
// - RPC for the project page and the thread tab (server/contract.ts).
// - Agent tools for the Elephant (the thread working with the human):
//   register specs, start reviews, read findings, contest, propose.
//   Deciding findings and applying proposals are human-only (RPC from the UI).
// - Skills in skills/ adapt the seven upstream EGM skills to these tools.
import { existsSync } from "node:fs";
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
  type Spec,
} from "./server/contract.ts";
import { Engine, EngineError } from "./server/engine.ts";
import { GoldfishClient } from "./server/goldfish.ts";
import { MIGRATIONS, Store } from "./server/store.ts";
import { resolveInside, WorkspaceError } from "./server/workspace.ts";

export { rpcContract };
export type * from "./server/contract.ts";

const ELEPHANT_TOOLS = ["egm_specs", "egm_register_spec", "egm_start_review", "egm_review_status", "egm_contest", "egm_propose"];
/** Frontmatter names of skills/<dir>/SKILL.md; configure() must select them explicitly. */
const SKILL_NAMES = ["egm-brainstorm", "egm-draft", "egm-review", "egm-review-loop", "egm-resolve", "egm-drift-report", "egm-bootstrap"];

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    goldfishBaseUrl: {
      type: "string",
      label: "Goldfish endpoint",
      description: "OpenAI-compatible base URL for reviewer calls, e.g. http://127.0.0.1:20128/v1. Reviewers get no tools.",
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
  db.pragma("foreign_keys = ON");
  bb.storage.migrate(db, MIGRATIONS);
  const store = new Store(db);

  const goldfish = new GoldfishClient(async () => {
    const s = await settings.get();
    const baseUrl = s.goldfishBaseUrl.trim().replace(/\/+$/, "");
    const model = s.goldfishModel.trim();
    const apiKey = s.goldfishApiKey?.trim() || (s.goldfishApiKeyEnv.trim() ? process.env[s.goldfishApiKeyEnv.trim()] ?? "" : "");
    if (!baseUrl || !model || !apiKey) return null;
    return { baseUrl, model, apiKey, timeoutMs: Math.max(10, s.goldfishTimeoutSeconds) * 1000 };
  });

  // The plugin reads and writes spec files from the BB server process, so a
  // project counts only when one of its local sources exists on this machine.
  const projectRoot = async (projectId: string): Promise<string | null> => {
    try {
      const project = await bb.sdk.projects.get({ projectId });
      const sources = [...project.sources].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
      return sources.find((source) => source.type === "local_path" && existsSync(source.path))?.path ?? null;
    } catch {
      return null;
    }
  };

  const changed = (projectId: string, specId: string | null) => bb.realtime.publish(CHANGED_CHANNEL, { projectId, specId });

  const engine = new Engine({ store, goldfish, projectRoot, changed, log: bb.log });
  await engine.reconcile();

  const describeAll = async (projectId: string): Promise<Spec[]> => {
    const out: Spec[] = [];
    for (const record of store.listSpecs(projectId)) out.push((await engine.describeSpec(record)).spec);
    return out;
  };

  const requireProjectSpec = (specId: string, projectId: string) => {
    const spec = store.getSpec(specId);
    if (!spec || spec.projectId !== projectId) throw new EngineError("Unknown spec.");
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
        if (project.kind !== "standard") continue;
        out.push({ id: project.id, name: project.name, root: await projectRoot(project.id) });
      }
      return { projects: out, current: null };
    },
    reviewer_status: () => goldfish.status(),
    specs_list: ({ projectId }) =>
      guard(async () => ({ specs: await describeAll(projectId), root: await projectRoot(projectId) })),
    specs_register: ({ projectId, path }) =>
      guard(async () => (await engine.describeSpec(await engine.registerSpec(projectId, path))).spec),
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
        const specs = await describeAll(thread.projectId);
        const activeRuns: Run[] = [];
        for (const spec of specs) {
          for (const run of await runsWithStale(spec.id)) {
            if (run.state === "running" || run.state === "awaiting_decisions") activeRuns.push(run);
          }
        }
        return { projectId: thread.projectId, specs, activeRuns };
      }),
    review_start: (input) =>
      guard(() =>
        engine.startRun(input.specId, {
          preset: input.preset,
          ...(input.lenses ? { lenses: input.lenses } : {}),
          ...(input.standard ? { standard: input.standard } : {}),
          context: input.context,
          maxRounds: input.maxRounds,
          threadId: input.threadId,
        }),
      ),
    review_cancel: ({ runId }) => guard(() => engine.cancelRun(runId)),
    finding_decide: ({ findingId, kind, rationale, opId }) =>
      guard(() => engine.decide(findingId, kind, rationale, "human", opId)),
    proposal_apply: ({ proposalId, baseHash, opId }) => guard(() => engine.applyProposal(proposalId, baseHash, opId)),
    proposal_reject: ({ proposalId, reason }) => guard(() => engine.rejectProposal(proposalId, reason)),
    workspace_search: ({ threadId, query }) =>
      guard(async () => {
        const thread = await bb.sdk.threads.get({ threadId });
        const root = await projectRoot(thread.projectId);
        if (!root || !thread.environmentId) throw new EngineError("Thread workspace is unavailable. Open a thread with an available project checkout and retry.");
        const environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
        const project = await bb.sdk.projects.get({ projectId: thread.projectId });
        const sources = [...project.sources].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
        const source = sources.find((item) => item.type === "local_path" && existsSync(item.path));
        if (environment.projectId !== thread.projectId || environment.status !== "ready" || !environment.path || !source || environment.hostId !== source.hostId || await fs.realpath(environment.path).catch(() => null) !== await fs.realpath(root).catch(() => null)) {
          throw new EngineError("Thread workspace does not match the server's available project checkout. Open a thread in that checkout and retry.");
        }
        const result = await bb.sdk.environments.paths({ environmentId: thread.environmentId, query, includeFiles: "true", includeDirectories: "false" });
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

  bb.agents.registerTool({
    name: "egm_specs",
    description: "List the specs registered in this project's Elephant Goldfish workspace, with review state and open findings.",
    presentation: { label: { pending: "Listing specs", completed: "Listed specs" } },
    parameters: z.object({}),
    async execute(_params, { projectId }) {
      try {
        return asText({ root: await projectRoot(projectId), specs: await describeAll(projectId) });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_register_spec",
    description: "Register a Markdown spec (project-relative path) in the Elephant Goldfish workspace so it can be reviewed.",
    presentation: { label: { pending: "Registering spec", completed: "Registered spec" } },
    parameters: z.object({ path: z.string().min(1).max(1024) }),
    async execute({ path }, { projectId }) {
      try {
        return asText((await engine.describeSpec(await engine.registerSpec(projectId, path))).spec);
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_start_review",
    description:
      "Start a Goldfish review of a registered spec. Reviewers run as fresh, tool-less model calls outside this conversation. Presets: full (stages 5-9), feature_spec (5-8), implementation (9), brainstorm (six lenses, BRAINSTORM mode), custom (chosen lenses). Returns at once; poll egm_review_status.",
    presentation: { label: { pending: "Starting Goldfish review", completed: "Started Goldfish review" } },
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
        requireProjectSpec(params.specId, projectId);
        const run = await engine.startRun(params.specId, {
          preset: params.preset,
          ...(params.lenses ? { lenses: params.lenses } : {}),
          ...(params.standard ? { standard: params.standard } : {}),
          context: params.context,
          maxRounds: params.maxRounds,
          threadId,
        });
        return asText(run);
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.registerTool({
    name: "egm_review_status",
    description:
      "Read a spec's review state: runs, stages, findings (with ids, severity, state, human decisions) and proposals. Use it to see what the human decided and which findings wait for you.",
    presentation: { label: { pending: "Reading review status", completed: "Read review status" } },
    parameters: z.object({ specId: z.string() }),
    async execute({ specId }, { projectId }) {
      try {
        const record = requireProjectSpec(specId, projectId);
        const { spec } = await engine.describeSpec(record);
        const latest = store.latestRun(specId);
        return asText({
          spec,
          runs: (await runsWithStale(specId)).slice(0, 5),
          stages: latest ? store.listStages(latest.id) : [],
          findings: store.listFindings(specId).filter((f) => f.state !== "superseded").slice(0, 100),
          proposals: store.listProposals(specId).slice(0, 10).map(({ diff: _diff, ...rest }) => rest),
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
    async execute({ findingId, rationale }, { projectId }) {
      try {
        const finding = store.getFinding(findingId);
        if (!finding) throw new EngineError("Unknown finding.");
        requireProjectSpec(finding.specId, projectId);
        return asText(await engine.contest(findingId, rationale));
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
        requireProjectSpec(specId, projectId);
        const proposal = await engine.propose(specId, findingIds, content, summary, threadId);
        const { diff, ...rest } = proposal;
        return asText({ ...rest, diffLines: diff.split("\n").length, next: "Tell the human to review and confirm the diff in the Elephant Goldfish tab." });
      } catch (cause) {
        return toolError(cause);
      }
    },
  });

  bb.agents.configure(() => ({ tools: ELEPHANT_TOOLS, skills: SKILL_NAMES }));

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
      const status = await goldfish.status();
      const lines = [`Goldfish: ${status.ready ? `ready (${status.model} at ${status.endpoint})` : `unavailable: ${status.reason}`}`];
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
