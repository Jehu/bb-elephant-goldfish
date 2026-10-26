// Wire contract shared by server.ts and app.tsx. Zod schemas run at the RPC
// boundary; the app imports only the types.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const SKILL_IDS = [
  "brainstorm",
  "draft",
  "review",
  "review-loop",
  "resolve",
  "drift-report",
  "bootstrap",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const LENS_IDS = [
  "zoom_out",
  "comprehension",
  "design_critic",
  "implementation_readiness",
  "structural",
  "style",
  "codebase_details",
] as const;
export type LensId = (typeof LENS_IDS)[number];

export const STANDARD_IDS = [
  "feature-spec-standard",
  "implementation-readiness-standard",
  "zoom-out-standard",
  "heilmeier-standard",
  "re-implementation-standard",
] as const;
export type StandardId = (typeof STANDARD_IDS)[number];

/**
 * Review presets mirror upstream egm_review's curated pipelines, plus the
 * brainstorm lens set from egm_brainstorm.
 */
export const PRESET_IDS = ["full", "feature_spec", "implementation", "brainstorm", "custom"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const SEVERITIES = ["blocker", "major", "nit", "unknown"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * A run's visible state. Every terminal state other than `completed` is a
 * non-success and is rendered as such; `completed` means every requested
 * stage returned a report, not that the document is free of findings.
 */
export const RUN_STATES = [
  "running",
  "awaiting_decisions",
  "completed",
  "failed",
  "cancelled",
  "limit_reached",
  "stale",
  "unknown",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const STAGE_STATES = ["pending", "running", "completed", "failed", "cancelled", "skipped"] as const;

/**
 * Finding lifecycle. Unresolved: open, fix_requested, contested,
 * proposal_pending. Resolved: fixed (an applied change addressed it),
 * accepted_tradeoff (the risk is kept on purpose), dismissed (the human
 * agreed it does not apply), superseded (a later round or an independent
 * edit replaced the version it was about).
 */
export const FINDING_STATES = [
  "open",
  "fix_requested",
  "contested",
  "proposal_pending",
  "fixed",
  "accepted_tradeoff",
  "dismissed",
  "superseded",
] as const;
export type FindingState = (typeof FINDING_STATES)[number];
export const UNRESOLVED_FINDING_STATES: FindingState[] = ["open", "fix_requested", "contested", "proposal_pending"];

export const PROPOSAL_STATES = ["proposed", "applied", "rejected", "stale", "conflict", "unknown"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/** Human decisions on a finding. The Elephant contests or proposes; only a human decides. */
export const DECISION_KINDS = ["request_fix", "accept_tradeoff", "dismiss"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

const projectId = z.string().min(1).max(128);
const id = z.string().min(1).max(64);
const relPath = z.string().min(1).max(1024);

export const specSchema = z.object({
  id,
  projectId,
  path: relPath,
  title: z.string(),
  /** sha256 of the file as it is on disk right now, or null when missing. */
  currentHash: z.string().nullable(),
  exists: z.boolean(),
  /** Latest run summary, or null. */
  latestRun: z
    .object({
      id,
      state: z.enum(RUN_STATES),
      targetHash: z.string(),
      stale: z.boolean(),
      round: z.number(),
      createdAt: z.number(),
    })
    .nullable(),
  openFindings: z.number(),
  pendingDecisions: z.number(),
  createdAt: z.number(),
});
export type Spec = z.infer<typeof specSchema>;

export const stageSchema = z.object({
  id,
  runId: id,
  round: z.number(),
  position: z.number(),
  lens: z.enum(LENS_IDS),
  standard: z.enum(STANDARD_IDS),
  state: z.enum(STAGE_STATES),
  /** Model and endpoint used, recorded when the stage ran. */
  provider: z.string().nullable(),
  error: z.string().nullable(),
  reportPath: z.string().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
});
export type Stage = z.infer<typeof stageSchema>;

export const findingSchema = z.object({
  id,
  runId: id,
  stageId: id,
  round: z.number(),
  lens: z.enum(LENS_IDS),
  severity: z.enum(SEVERITIES),
  /** The reviewer's own severity label before normalization. */
  rawSeverity: z.string(),
  title: z.string(),
  body: z.string(),
  /** Line range in the reviewed version; informational, may not match the current file. */
  lineStart: z.number().nullable(),
  lineEnd: z.number().nullable(),
  state: z.enum(FINDING_STATES),
  decision: z
    .object({
      kind: z.enum(DECISION_KINDS),
      rationale: z.string(),
      decidedBy: z.string(),
      decidedAt: z.number(),
    })
    .nullable(),
  /** The Elephant's contest rationale, when it argued the finding does not apply. */
  elephantNote: z.string().nullable(),
  proposalId: id.nullable(),
  createdAt: z.number(),
});
export type Finding = z.infer<typeof findingSchema>;

export const proposalSchema = z.object({
  id,
  specId: id,
  runId: id.nullable(),
  findingIds: z.array(id),
  /** Hash of the content the proposal was computed against. */
  baseHash: z.string(),
  resultHash: z.string(),
  diff: z.string(),
  summary: z.string(),
  /** Who authored it: an agent thread id, or "human". */
  author: z.string(),
  state: z.enum(PROPOSAL_STATES),
  stateReason: z.string().nullable(),
  appliedAt: z.number().nullable(),
  /** Path of the pre-image kept beside the file when applying; null until applied. */
  backupPath: z.string().nullable(),
  createdAt: z.number(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const runSchema = z.object({
  id,
  specId: id,
  projectId,
  preset: z.enum(PRESET_IDS),
  round: z.number(),
  maxRounds: z.number(),
  state: z.enum(RUN_STATES),
  stateReason: z.string().nullable(),
  /** Exact content hash the stages of this round reviewed. */
  targetHash: z.string(),
  /** True when the file on disk no longer matches targetHash. */
  stale: z.boolean(),
  /** Workspace-relative context files the reviewers were given. */
  context: z.array(relPath),
  /** Thread that launched the run, when launched from a thread. */
  threadId: z.string().nullable(),
  /** Run this one continued from (automatic next round). */
  parentRunId: id.nullable(),
  reportDir: z.string(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
});
export type Run = z.infer<typeof runSchema>;

export const eventSchema = z.object({
  id: z.number(),
  specId: id.nullable(),
  runId: id.nullable(),
  kind: z.string(),
  message: z.string(),
  at: z.number(),
});
export type EventRow = z.infer<typeof eventSchema>;

export const reviewerStatusSchema = z.object({
  ready: z.boolean(),
  reason: z.string().nullable(),
  model: z.string().nullable(),
  endpoint: z.string().nullable(),
});
export type ReviewerStatus = z.infer<typeof reviewerStatusSchema>;

export const rpcContract = defineRpcContract({
  projects_list: {
    input: z.null(),
    output: z.object({
      projects: z.array(z.object({ id: projectId, name: z.string(), root: z.string().nullable() })),
      current: projectId.nullable(),
    }),
  },
  reviewer_status: {
    input: z.null(),
    output: reviewerStatusSchema,
  },
  specs_list: {
    input: z.object({ projectId }),
    output: z.object({ specs: z.array(specSchema), root: z.string().nullable() }),
  },
  specs_register: {
    input: z.object({ projectId, path: relPath }),
    output: specSchema,
  },
  specs_forget: {
    input: z.object({ specId: id }),
    output: z.object({ removed: z.boolean() }),
  },
  spec_detail: {
    input: z.object({ specId: id }),
    output: z.object({
      spec: specSchema,
      content: z.string().nullable(),
      runs: z.array(runSchema),
      stages: z.array(stageSchema),
      findings: z.array(findingSchema),
      proposals: z.array(proposalSchema),
      events: z.array(eventSchema),
    }),
  },
  thread_overview: {
    input: z.object({ threadId: z.string() }),
    output: z.object({
      projectId: projectId.nullable(),
      specs: z.array(specSchema),
      activeRuns: z.array(runSchema),
    }),
  },
  review_start: {
    input: z.object({
      specId: id,
      preset: z.enum(PRESET_IDS),
      lenses: z.array(z.enum(LENS_IDS)).optional(),
      standard: z.enum(STANDARD_IDS).optional(),
      context: z.array(relPath).max(20).default([]),
      maxRounds: z.number().int().min(1).max(10).default(3),
      threadId: z.string().nullable().default(null),
    }),
    output: runSchema,
  },
  review_cancel: {
    input: z.object({ runId: id }),
    output: runSchema,
  },
  finding_decide: {
    input: z.object({
      findingId: id,
      kind: z.enum(DECISION_KINDS),
      rationale: z.string().max(4000).default(""),
      /** Idempotency key chosen by the caller; a repeat with the same key is a no-op. */
      opId: z.string().min(1).max(64),
    }),
    output: findingSchema,
  },
  proposal_apply: {
    input: z.object({ proposalId: id, baseHash: z.string(), opId: z.string().min(1).max(64) }),
    output: proposalSchema,
  },
  proposal_reject: {
    input: z.object({ proposalId: id, reason: z.string().max(4000).default("") }),
    output: proposalSchema,
  },
  /** Ask the Elephant thread (the launching thread) to work on open findings. */
  elephant_request: {
    input: z.object({ runId: id, threadId: z.string() }),
    output: z.object({ delivery: z.string() }),
  },
});
export type RpcContract = typeof rpcContract;

/** Realtime channel: payload `{ projectId, specId?, runId? }`. */
export const CHANGED_CHANNEL = "egm-changed";
