// Durable workflow state in the plugin's SQLite database. Specs and reports
// stay as Markdown in the workspace; this database indexes runs, findings,
// decisions, proposals and applications with their provenance.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  DecisionKind,
  EventRow,
  Finding,
  FindingState,
  LensId,
  PresetId,
  Proposal,
  ProposalState,
  Run,
  RunState,
  ReviewerSnapshotDto,
  Severity,
  Spec,
  Stage,
  StandardId,
} from "./contract.ts";
import { reviewerSnapshotSchema } from "./contract.ts";

// Append-only. Never edit or reorder shipped statements.
export const MIGRATIONS: string[] = [
  `CREATE TABLE specs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (project_id, path)
  )`,
  `CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    spec_id TEXT NOT NULL REFERENCES specs(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    preset TEXT NOT NULL,
    round INTEGER NOT NULL,
    max_rounds INTEGER NOT NULL,
    state TEXT NOT NULL,
    state_reason TEXT,
    target_hash TEXT NOT NULL,
    context_json TEXT NOT NULL,
    thread_id TEXT,
    parent_run_id TEXT,
    report_dir TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  )`,
  `CREATE INDEX runs_spec ON runs(spec_id, created_at)`,
  `CREATE TABLE stages (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    position INTEGER NOT NULL,
    lens TEXT NOT NULL,
    standard TEXT NOT NULL,
    state TEXT NOT NULL,
    provider TEXT,
    error TEXT,
    report_path TEXT,
    raw_report TEXT,
    started_at INTEGER,
    finished_at INTEGER
  )`,
  `CREATE TABLE findings (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    spec_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    lens TEXT NOT NULL,
    severity TEXT NOT NULL,
    raw_severity TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    state TEXT NOT NULL,
    decision_kind TEXT,
    decision_rationale TEXT,
    decided_by TEXT,
    decided_at INTEGER,
    elephant_note TEXT,
    proposal_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX findings_spec ON findings(spec_id, state)`,
  `CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    spec_id TEXT NOT NULL REFERENCES specs(id) ON DELETE CASCADE,
    run_id TEXT,
    finding_ids_json TEXT NOT NULL,
    base_hash TEXT NOT NULL,
    result_hash TEXT NOT NULL,
    result_content TEXT NOT NULL,
    diff TEXT NOT NULL,
    summary TEXT NOT NULL,
    author TEXT NOT NULL,
    state TEXT NOT NULL,
    state_reason TEXT,
    applied_at INTEGER,
    backup_path TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE operations (
    op_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spec_id TEXT,
    run_id TEXT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX events_spec ON events(spec_id, id)`,
  // Application intents survive a crash between "decided to write" and
  // "verified written"; reconciliation reads them on load.
  `CREATE TABLE apply_intents (
    proposal_id TEXT PRIMARY KEY,
    target_path TEXT NOT NULL,
    base_hash TEXT NOT NULL,
    result_hash TEXT NOT NULL,
    backup_path TEXT NOT NULL,
    staged_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `ALTER TABLE apply_intents ADD COLUMN operation_id TEXT`,
  `CREATE TABLE ad_hoc_review_tasks (
    proposal_id TEXT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
    target_hash TEXT NOT NULL,
    options_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    run_id TEXT REFERENCES runs(id)
  )`,
  `ALTER TABLE runs ADD COLUMN engine TEXT NOT NULL DEFAULT 'goldfish';
   ALTER TABLE runs ADD COLUMN provider TEXT;
   ALTER TABLE runs ADD COLUMN model TEXT;
   ALTER TABLE stages ADD COLUMN engine TEXT NOT NULL DEFAULT 'goldfish';
   ALTER TABLE stages ADD COLUMN model TEXT;
   ALTER TABLE stages ADD COLUMN worker_thread_id TEXT;
   CREATE TABLE reviewer_consent (scope TEXT PRIMARY KEY, granted_at INTEGER NOT NULL);`,
  `ALTER TABLE runs ADD COLUMN environment_id TEXT;`,
  `ALTER TABLE apply_intents ADD COLUMN reviewer_json TEXT;`,
];

export const newId = (): string => randomUUID().replace(/-/g, "").slice(0, 24);

type SpecRow = { id: string; project_id: string; path: string; title: string; created_at: number };
type RunRow = {
  id: string;
  spec_id: string;
  project_id: string;
  preset: string;
  round: number;
  max_rounds: number;
  state: string;
  state_reason: string | null;
  target_hash: string;
  context_json: string;
  environment_id: string | null;
  thread_id: string | null;
  parent_run_id: string | null;
  report_dir: string;
  created_at: number;
  finished_at: number | null;
  engine: string;
  provider: string | null;
  model: string | null;
};
type StageRow = {
  id: string;
  run_id: string;
  round: number;
  position: number;
  lens: string;
  standard: string;
  state: string;
  provider: string | null;
  engine: string;
  model: string | null;
  worker_thread_id: string | null;
  error: string | null;
  report_path: string | null;
  raw_report: string | null;
  started_at: number | null;
  finished_at: number | null;
};
type FindingRow = {
  id: string;
  run_id: string;
  stage_id: string;
  spec_id: string;
  round: number;
  lens: string;
  severity: string;
  raw_severity: string;
  title: string;
  body: string;
  line_start: number | null;
  line_end: number | null;
  state: string;
  decision_kind: string | null;
  decision_rationale: string | null;
  decided_by: string | null;
  decided_at: number | null;
  elephant_note: string | null;
  proposal_id: string | null;
  created_at: number;
};
type ProposalRow = {
  id: string;
  spec_id: string;
  run_id: string | null;
  finding_ids_json: string;
  base_hash: string;
  result_hash: string;
  result_content: string;
  diff: string;
  summary: string;
  author: string;
  state: string;
  state_reason: string | null;
  applied_at: number | null;
  backup_path: string | null;
  created_at: number;
};
export type ApplyIntent = {
  proposalId: string;
  targetPath: string;
  baseHash: string;
  resultHash: string;
  backupPath: string;
  stagedPath: string;
  createdAt: number;
  operationId?: string | null;
  /** Reviewer snapshot captured before the file mutation; null on legacy rows. */
  reviewer?: ReviewerSnapshotDto | null;
};

export type AdHocReviewOptions = {
  preset: PresetId;
  lenses?: LensId[];
  standard?: StandardId;
  context: string[];
  maxRounds: number;
  threadId: string | null;
  reviewer?: ReviewerSnapshotDto;
};

export type AdHocReviewTask = {
  proposalId: string;
  targetHash: string;
  options: AdHocReviewOptions;
  createdAt: number;
  runId: string | null;
};

type AdHocReviewTaskRow = {
  proposal_id: string;
  target_hash: string;
  options_json: string;
  created_at: number;
  run_id: string | null;
};

const parseReviewerSnapshot = (value: unknown): ReviewerSnapshotDto | undefined => {
  if (value == null) return undefined;
  const parsed = reviewerSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const adHocReviewTaskFromRow = (r: AdHocReviewTaskRow): AdHocReviewTask => {
  const options = JSON.parse(r.options_json) as AdHocReviewOptions;
  return {
    proposalId: r.proposal_id,
    targetHash: r.target_hash,
    options: { ...options, reviewer: parseReviewerSnapshot(options.reviewer) },
    createdAt: r.created_at,
    runId: r.run_id,
  };
};

/** A spec row without the live file facts the RPC layer adds. */
export type SpecRecord = { id: string; projectId: string; path: string; title: string; createdAt: number };

const runFromRow = (r: RunRow): Run => ({
  id: r.id,
  specId: r.spec_id,
  projectId: r.project_id,
  preset: r.preset as PresetId,
  round: r.round,
  maxRounds: r.max_rounds,
  state: r.state as RunState,
  stateReason: r.state_reason,
  targetHash: r.target_hash,
  stale: false,
  context: JSON.parse(r.context_json) as string[],
  threadId: r.thread_id,
  environmentId: r.environment_id,
  engine: r.engine as import("./contract.ts").ReviewerEngine,
  provider: r.provider,
  model: r.model,
  parentRunId: r.parent_run_id,
  reportDir: r.report_dir,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

const stageFromRow = (r: StageRow): Stage => ({
  id: r.id,
  runId: r.run_id,
  round: r.round,
  position: r.position,
  lens: r.lens as LensId,
  standard: r.standard as StandardId,
  state: r.state as Stage["state"],
  engine: r.engine as import("./contract.ts").ReviewerEngine,
  provider: r.provider,
  model: r.model,
  workerThreadId: r.worker_thread_id,
  error: r.error,
  reportPath: r.report_path,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

const findingFromRow = (r: FindingRow): Finding => ({
  id: r.id,
  runId: r.run_id,
  stageId: r.stage_id,
  round: r.round,
  lens: r.lens as LensId,
  severity: r.severity as Severity,
  rawSeverity: r.raw_severity,
  title: r.title,
  body: r.body,
  lineStart: r.line_start,
  lineEnd: r.line_end,
  state: r.state as FindingState,
  decision:
    r.decision_kind === null
      ? null
      : {
          kind: r.decision_kind as DecisionKind,
          rationale: r.decision_rationale ?? "",
          decidedBy: r.decided_by ?? "",
          decidedAt: r.decided_at ?? 0,
        },
  elephantNote: r.elephant_note,
  proposalId: r.proposal_id,
  createdAt: r.created_at,
});

const proposalFromRow = (r: ProposalRow): Proposal => ({
  id: r.id,
  specId: r.spec_id,
  runId: r.run_id,
  findingIds: JSON.parse(r.finding_ids_json) as string[],
  baseHash: r.base_hash,
  resultHash: r.result_hash,
  diff: r.diff,
  summary: r.summary,
  author: r.author,
  state: r.state as ProposalState,
  stateReason: r.state_reason,
  appliedAt: r.applied_at,
  backupPath: r.backup_path,
  createdAt: r.created_at,
});

export class Store {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // --- specs -------------------------------------------------------------

  listSpecs(projectId: string): SpecRecord[] {
    const rows = this.db
      .prepare<[string], SpecRow>("SELECT * FROM specs WHERE project_id = ? ORDER BY path")
      .all(projectId);
    return rows.map((r) => ({ id: r.id, projectId: r.project_id, path: r.path, title: r.title, createdAt: r.created_at }));
  }

  getSpec(specId: string): SpecRecord | null {
    const r = this.db.prepare<[string], SpecRow>("SELECT * FROM specs WHERE id = ?").get(specId);
    return r ? { id: r.id, projectId: r.project_id, path: r.path, title: r.title, createdAt: r.created_at } : null;
  }

  findSpecByPath(projectId: string, path: string): SpecRecord | null {
    const r = this.db
      .prepare<[string, string], SpecRow>("SELECT * FROM specs WHERE project_id = ? AND path = ?")
      .get(projectId, path);
    return r ? { id: r.id, projectId: r.project_id, path: r.path, title: r.title, createdAt: r.created_at } : null;
  }

  insertSpec(spec: SpecRecord): void {
    this.db
      .prepare("INSERT INTO specs (id, project_id, path, title, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(spec.id, spec.projectId, spec.path, spec.title, spec.createdAt);
  }

  updateSpecTitle(specId: string, title: string): void {
    this.db.prepare("UPDATE specs SET title = ? WHERE id = ?").run(title, specId);
  }

  deleteSpec(specId: string): boolean {
    return this.db.prepare("DELETE FROM specs WHERE id = ?").run(specId).changes > 0;
  }

  // --- runs --------------------------------------------------------------

  insertRun(run: Run): void {
    this.db.prepare(
      `INSERT INTO runs (id, spec_id, project_id, preset, round, max_rounds, state, state_reason, target_hash,
        context_json, thread_id, environment_id, engine, provider, model, parent_run_id, report_dir, created_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(run.id, run.specId, run.projectId, run.preset, run.round, run.maxRounds, run.state, run.stateReason,
      run.targetHash, JSON.stringify(run.context), run.threadId, run.environmentId, run.engine, run.provider, run.model,
      run.parentRunId, run.reportDir, run.createdAt, run.finishedAt);
  }

  getRun(runId: string): Run | null {
    const r = this.db.prepare<[string], RunRow>("SELECT * FROM runs WHERE id = ?").get(runId);
    return r ? runFromRow(r) : null;
  }

  listRuns(specId: string): Run[] {
    return this.db
      .prepare<[string], RunRow>("SELECT * FROM runs WHERE spec_id = ? ORDER BY created_at DESC")
      .all(specId)
      .map(runFromRow);
  }

  listRunsByState(states: RunState[]): Run[] {
    const marks = states.map(() => "?").join(",");
    return this.db
      .prepare<string[], RunRow>(`SELECT * FROM runs WHERE state IN (${marks}) ORDER BY created_at`)
      .all(...states)
      .map(runFromRow);
  }

  latestRun(specId: string): Run | null {
    const r = this.db
      .prepare<[string], RunRow>("SELECT * FROM runs WHERE spec_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(specId);
    return r ? runFromRow(r) : null;
  }

  /** Transition a run only from one of `from`; returns false when the state had moved on. */
  setRunState(runId: string, from: RunState[], to: RunState, reason: string | null, finished: boolean): boolean {
    const marks = from.map(() => "?").join(",");
    const res = this.db
      .prepare(
        `UPDATE runs SET state = ?, state_reason = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ? AND state IN (${marks})`,
      )
      .run(to, reason, finished ? Date.now() : null, runId, ...from);
    return res.changes > 0;
  }

  // --- stages ------------------------------------------------------------

  insertStage(stage: Stage): void {
    this.db.prepare(
      `INSERT INTO stages (id, run_id, round, position, lens, standard, state, engine, provider, model, worker_thread_id, error, report_path, raw_report, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(stage.id, stage.runId, stage.round, stage.position, stage.lens, stage.standard, stage.state,
      stage.engine, stage.provider, stage.model, stage.workerThreadId, stage.error, stage.reportPath,
      null, stage.startedAt, stage.finishedAt);
  }

  listStages(runId: string): Stage[] {
    return this.db.prepare<[string], StageRow>("SELECT * FROM stages WHERE run_id = ? ORDER BY position").all(runId).map(stageFromRow);
  }

  listStagesForSpec(specId: string): Stage[] {
    return this.db.prepare<[string], StageRow>("SELECT s.* FROM stages s JOIN runs r ON r.id = s.run_id WHERE r.spec_id = ? ORDER BY r.created_at DESC, s.position").all(specId).map(stageFromRow);
  }

  updateStage(stageId: string, patch: Partial<Pick<Stage, "state" | "provider" | "model" | "workerThreadId" | "error" | "reportPath" | "startedAt" | "finishedAt">> & { rawReport?: string }): void {
    const map = { state: "state", provider: "provider", model: "model", workerThreadId: "worker_thread_id", error: "error", reportPath: "report_path", startedAt: "started_at", finishedAt: "finished_at", rawReport: "raw_report" };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(map)) if (key in patch) {
      sets.push(`${column} = ?`);
      values.push((patch as Record<string, unknown>)[key]);
    }
    if (sets.length === 0) return;
    values.push(stageId);
    this.db.prepare(`UPDATE stages SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  hasReviewerConsent(scope = "installation"): boolean {
    return Boolean(this.db.prepare<[string], { scope: string }>("SELECT scope FROM reviewer_consent WHERE scope = ?").get(scope));
  }

  grantReviewerConsent(scope = "installation"): void {
    this.db.prepare("INSERT OR REPLACE INTO reviewer_consent (scope, granted_at) VALUES (?, ?)").run(scope, Date.now());
  }

  revokeReviewerConsent(scope = "installation"): void {
    this.db.prepare<[string]>("DELETE FROM reviewer_consent WHERE scope = ?").run(scope);
  }

  // --- findings ----------------------------------------------------------

  insertFinding(f: Finding, specId: string): void {
    this.db
      .prepare(
        `INSERT INTO findings (id, run_id, stage_id, spec_id, round, lens, severity, raw_severity, title, body,
          line_start, line_end, state, decision_kind, decision_rationale, decided_by, decided_at, elephant_note, proposal_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        f.id,
        f.runId,
        f.stageId,
        specId,
        f.round,
        f.lens,
        f.severity,
        f.rawSeverity,
        f.title,
        f.body,
        f.lineStart,
        f.lineEnd,
        f.state,
        f.proposalId,
        f.createdAt,
      );
  }

  getFinding(findingId: string): (Finding & { specId: string }) | null {
    const r = this.db.prepare<[string], FindingRow>("SELECT * FROM findings WHERE id = ?").get(findingId);
    return r ? { ...findingFromRow(r), specId: r.spec_id } : null;
  }

  listFindings(specId: string): Finding[] {
    return this.db
      .prepare<[string], FindingRow>("SELECT * FROM findings WHERE spec_id = ? ORDER BY created_at DESC")
      .all(specId)
      .map(findingFromRow);
  }

  listFindingsForRun(runId: string): Finding[] {
    return this.db
      .prepare<[string], FindingRow>("SELECT * FROM findings WHERE run_id = ? ORDER BY created_at")
      .all(runId)
      .map(findingFromRow);
  }

  countFindings(specId: string, states: FindingState[]): number {
    const marks = states.map(() => "?").join(",");
    const row = this.db
      .prepare<string[], { n: number }>(`SELECT COUNT(*) AS n FROM findings WHERE spec_id = ? AND state IN (${marks})`)
      .get(specId, ...states);
    return row?.n ?? 0;
  }

  setFindingState(findingId: string, state: FindingState, proposalId?: string | null): void {
    if (proposalId === undefined) {
      this.db.prepare("UPDATE findings SET state = ? WHERE id = ?").run(state, findingId);
    } else {
      this.db.prepare("UPDATE findings SET state = ?, proposal_id = ? WHERE id = ?").run(state, proposalId, findingId);
    }
  }

  setElephantNote(findingId: string, state: FindingState, note: string): void {
    this.db.prepare("UPDATE findings SET state = ?, elephant_note = ? WHERE id = ?").run(state, note, findingId);
  }

  setFindingDecision(
    findingId: string,
    state: FindingState,
    decision: { kind: DecisionKind; rationale: string; decidedBy: string; decidedAt: number },
  ): void {
    this.db
      .prepare(
        "UPDATE findings SET state = ?, decision_kind = ?, decision_rationale = ?, decided_by = ?, decided_at = ? WHERE id = ?",
      )
      .run(state, decision.kind, decision.rationale, decision.decidedBy, decision.decidedAt, findingId);
  }

  /**
   * Supersede every unresolved finding of this spec that does not belong to
   * `exceptRunId`: they were about a version the document no longer has.
   */
  supersedeUnresolvedFindings(specId: string, exceptRunId: string | null): number {
    return this.db
      .prepare(
        "UPDATE findings SET state = 'superseded' WHERE spec_id = ? AND state IN ('open', 'fix_requested', 'contested', 'proposal_pending') AND run_id IS NOT ?",
      )
      .run(specId, exceptRunId).changes;
  }

  // --- proposals ---------------------------------------------------------

  insertProposal(p: Proposal, resultContent: string): void {
    this.db
      .prepare(
        `INSERT INTO proposals (id, spec_id, run_id, finding_ids_json, base_hash, result_hash, result_content, diff, summary,
          author, state, state_reason, applied_at, backup_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        p.id,
        p.specId,
        p.runId,
        JSON.stringify(p.findingIds),
        p.baseHash,
        p.resultHash,
        resultContent,
        p.diff,
        p.summary,
        p.author,
        p.state,
        p.stateReason,
        p.appliedAt,
        p.backupPath,
        p.createdAt,
      );
  }

  getProposal(proposalId: string): (Proposal & { resultContent: string }) | null {
    const r = this.db.prepare<[string], ProposalRow>("SELECT * FROM proposals WHERE id = ?").get(proposalId);
    return r ? { ...proposalFromRow(r), resultContent: r.result_content } : null;
  }

  listProposals(specId: string): Proposal[] {
    return this.db
      .prepare<[string], ProposalRow>("SELECT * FROM proposals WHERE spec_id = ? ORDER BY created_at DESC")
      .all(specId)
      .map(proposalFromRow);
  }

  setProposalState(
    proposalId: string,
    from: ProposalState[],
    to: ProposalState,
    reason: string | null,
    extra?: { appliedAt?: number; backupPath?: string },
  ): boolean {
    const marks = from.map(() => "?").join(",");
    const res = this.db
      .prepare(
        `UPDATE proposals SET state = ?, state_reason = ?, applied_at = COALESCE(?, applied_at), backup_path = COALESCE(?, backup_path)
         WHERE id = ? AND state IN (${marks})`,
      )
      .run(to, reason, extra?.appliedAt ?? null, extra?.backupPath ?? null, proposalId, ...from);
    return res.changes > 0;
  }

  /** Proposals still pending against a hash the file no longer has. */
  staleProposals(specId: string, currentHash: string | null): number {
    return this.db
      .prepare(
        "UPDATE proposals SET state = 'stale', state_reason = 'the document changed after this proposal was made' WHERE spec_id = ? AND state = 'proposed' AND base_hash IS NOT ? AND NOT EXISTS (SELECT 1 FROM apply_intents WHERE proposal_id = proposals.id)",
      )
      .run(specId, currentHash).changes;
  }

  /** Pending proposals of other runs answer findings a new round superseded. */
  supersedePendingProposals(specId: string, exceptRunId: string): number {
    return this.db
      .prepare(
        "UPDATE proposals SET state = 'stale', state_reason = 'a new review round replaced the findings it answered' WHERE spec_id = ? AND state = 'proposed' AND run_id IS NOT ?",
      )
      .run(specId, exceptRunId).changes;
  }

  // --- idempotent operations ---------------------------------------------

  getOperation<T>(opId: string): T | null {
    const r = this.db.prepare<[string], { result_json: string }>("SELECT result_json FROM operations WHERE op_id = ?").get(opId);
    return r ? (JSON.parse(r.result_json) as T) : null;
  }

  putOperation(opId: string, kind: string, result: unknown): void {
    this.db
      .prepare("INSERT INTO operations (op_id, kind, result_json, created_at) VALUES (?, ?, ?, ?)")
      .run(opId, kind, JSON.stringify(result), Date.now());
  }

  // --- apply intents -----------------------------------------------------

  putApplyIntent(intent: ApplyIntent): void {
    this.db
      .prepare(
        `INSERT INTO apply_intents (proposal_id, target_path, base_hash, result_hash, backup_path, staged_path, created_at, operation_id, reviewer_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        intent.proposalId,
        intent.targetPath,
        intent.baseHash,
        intent.resultHash,
        intent.backupPath,
        intent.stagedPath,
        intent.createdAt,
        intent.operationId ?? null,
        intent.reviewer ? JSON.stringify(reviewerSnapshotSchema.parse(intent.reviewer)) : null,
      );
  }

  deleteApplyIntent(proposalId: string): void {
    this.db.prepare("DELETE FROM apply_intents WHERE proposal_id = ?").run(proposalId);
  }

  listApplyIntents(): ApplyIntent[] {
    type Row = {
      proposal_id: string;
      target_path: string;
      base_hash: string;
      result_hash: string;
      backup_path: string;
      staged_path: string;
      created_at: number;
      operation_id: string | null;
      reviewer_json: string | null;
    };
    return this.db
      .prepare<[], Row>("SELECT * FROM apply_intents ORDER BY created_at")
      .all()
      .map((r) => ({
        proposalId: r.proposal_id,
        targetPath: r.target_path,
        baseHash: r.base_hash,
        resultHash: r.result_hash,
        backupPath: r.backup_path,
        stagedPath: r.staged_path,
        createdAt: r.created_at,
        operationId: r.operation_id,
        reviewer: parseReviewerSnapshot(r.reviewer_json ? JSON.parse(r.reviewer_json) : null) ?? null,
      }));
  }

  // --- ad hoc review tasks -----------------------------------------------

  putAdHocReviewTask(task: Omit<AdHocReviewTask, "runId">): void {
    this.db
      .prepare(
        `INSERT INTO ad_hoc_review_tasks (proposal_id, target_hash, options_json, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(proposal_id) DO NOTHING`,
      )
      .run(task.proposalId, task.targetHash, JSON.stringify(task.options.reviewer ? { ...task.options, reviewer: reviewerSnapshotSchema.parse(task.options.reviewer) } : task.options), task.createdAt);
  }

  getAdHocReviewTask(proposalId: string): AdHocReviewTask | null {
    const row = this.db
      .prepare<[string], AdHocReviewTaskRow>("SELECT * FROM ad_hoc_review_tasks WHERE proposal_id = ?")
      .get(proposalId);
    return row ? adHocReviewTaskFromRow(row) : null;
  }

  listPendingAdHocReviewTasks(): AdHocReviewTask[] {
    return this.db
      .prepare<[], AdHocReviewTaskRow>("SELECT * FROM ad_hoc_review_tasks WHERE run_id IS NULL ORDER BY created_at, proposal_id")
      .all()
      .map(adHocReviewTaskFromRow);
  }

  deleteOtherPendingAdHocReviewTasks(specId: string, proposalId: string): void {
    this.db.prepare(`DELETE FROM ad_hoc_review_tasks WHERE run_id IS NULL AND proposal_id != ?
      AND proposal_id IN (SELECT id FROM proposals WHERE spec_id = ?)`).run(proposalId, specId);
  }

  advancePendingAdHocReviewTasks(specId: string, baseHash: string, resultHash: string): void {
    this.db.prepare(`UPDATE ad_hoc_review_tasks SET target_hash = ? WHERE run_id IS NULL AND target_hash = ?
      AND proposal_id IN (SELECT id FROM proposals WHERE spec_id = ?)`).run(resultHash, baseHash, specId);
  }

  associateMatchingAdHocReviewRuns(specId: string, targetHash: string, runId: string): void {
    this.db.prepare(`UPDATE ad_hoc_review_tasks SET run_id = ? WHERE run_id IS NULL AND target_hash = ?
      AND proposal_id IN (SELECT id FROM proposals WHERE spec_id = ?)`).run(runId, targetHash, specId);
  }

  /** Call in the same transaction as inserting the run and its stages. */
  associateAdHocReviewRun(proposalId: string, runId: string): boolean {
    return this.db
      .prepare("UPDATE ad_hoc_review_tasks SET run_id = ? WHERE proposal_id = ? AND run_id IS NULL")
      .run(runId, proposalId).changes > 0;
  }

  // --- events ------------------------------------------------------------

  addEvent(specId: string | null, runId: string | null, kind: string, message: string): void {
    this.db
      .prepare("INSERT INTO events (spec_id, run_id, kind, message, at) VALUES (?, ?, ?, ?, ?)")
      .run(specId, runId, kind, message.slice(0, 2000), Date.now());
  }

  listEvents(specId: string, limit = 100): EventRow[] {
    type Row = { id: number; spec_id: string | null; run_id: string | null; kind: string; message: string; at: number };
    return this.db
      .prepare<[string, number], Row>("SELECT * FROM events WHERE spec_id = ? ORDER BY id DESC LIMIT ?")
      .all(specId, limit)
      .map((r) => ({ id: r.id, specId: r.spec_id, runId: r.run_id, kind: r.kind, message: r.message, at: r.at }));
  }
}
