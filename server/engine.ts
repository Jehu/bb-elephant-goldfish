// The review workflow: runs, stages, findings, human decisions, Elephant
// proposals, explicit apply and the automatic next round.
//
// Invariants:
// - Only a human decision resolves a finding; the Elephant contests or proposes.
// - Apply uses cooperative version checks; external writers are not excluded.
// - A next round starts automatically only after at least one confirmed
//   change was applied in the round and no finding of the round is unresolved.
// - Every non-success ends in a visible non-success state with a reason.
import path from "node:path";
import {
  UNRESOLVED_FINDING_STATES,
  type DecisionKind,
  type Finding,
  type LensId,
  type PresetId,
  type Proposal,
  type Run,
  type RunState,
  type Spec,
  type StandardId,
} from "./contract.ts";
import { unifiedDiff } from "./diff.ts";
import type { GoldfishClient } from "./goldfish.ts";
import { parseFindings, presetStages, stageMessages, type ContextFile } from "./prompts.ts";
import { newId, type SpecRecord, type Store } from "./store.ts";
import {
  compareAndReplace,
  planApply,
  WorkspaceError,
  readInside,
  reconcileApply,
  resolveInside,
  sha256,
  writeReport,
} from "./workspace.ts";

export class EngineError extends Error {}

export type EngineDeps = {
  store: Store;
  goldfish: GoldfishClient;
  /** Absolute workspace root of a project on this BB server, or null. */
  projectRoot(projectId: string): Promise<string | null>;
  /** Tell open views something changed. */
  changed(projectId: string, specId: string | null): void;
  log: { info(msg: string): void; warn(msg: string): void };
};

export type StartOptions = {
  preset: PresetId;
  lenses?: LensId[];
  standard?: StandardId;
  context: string[];
  maxRounds: number;
  threadId: string | null;
};

const MAX_CONTEXT_BYTES = 400_000;
const REPORT_ROOT = ".egm/reviews";

const titleOf = (content: string, fallback: string): string =>
  /^#\s+(.+)$/m.exec(content)?.[1]?.trim().slice(0, 200) ?? fallback;

export class Engine {
  private readonly running = new Map<string, AbortController>();
  private readonly locks = new Map<string, Promise<unknown>>();
  /** Background work (stage execution, automatic next rounds) not yet finished. */
  private readonly background = new Set<Promise<unknown>>();

  private track(work: Promise<unknown>): void {
    this.background.add(work);
    void work.finally(() => this.background.delete(work));
  }

  private readonly deps: EngineDeps;

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  /** Serialize work per spec inside this process. */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const { promise: next, resolve: release } = Promise.withResolvers<void>();
    const chained = prev.then(() => next);
    this.locks.set(key, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }

  private async root(projectId: string): Promise<string> {
    const root = await this.deps.projectRoot(projectId);
    if (root === null) {
      throw new EngineError("This project has no checkout on the BB server's machine; the spec workspace needs local files.");
    }
    return root;
  }

  private event(spec: SpecRecord, runId: string | null, kind: string, message: string): void {
    this.deps.store.addEvent(spec.id, runId, kind, message);
  }

  // --- specs -------------------------------------------------------------

  async registerSpec(projectId: string, relative: string): Promise<SpecRecord> {
    const root = await this.root(projectId);
    const normalized = path.posix.normalize(relative.replaceAll("\\", "/"));
    if (!normalized.toLowerCase().endsWith(".md")) throw new EngineError("A spec must be a Markdown (.md) file.");
    const file = await readInside(root, normalized);
    if ("missing" in file) throw new EngineError(`No such file in the project: ${normalized}`);
    const existing = this.deps.store.findSpecByPath(projectId, normalized);
    if (existing) return existing;
    const spec: SpecRecord = {
      id: newId(),
      projectId,
      path: normalized,
      title: titleOf(file.content, path.posix.basename(normalized)),
      createdAt: Date.now(),
    };
    this.deps.store.insertSpec(spec);
    this.event(spec, null, "registered", `Registered ${normalized}`);
    this.deps.changed(projectId, spec.id);
    return spec;
  }

  private pendingProposals(specId: string): Proposal[] {
    const intents = new Set(this.deps.store.listApplyIntents().map((intent) => intent.proposalId));
    return this.deps.store.listProposals(specId).filter((proposal) => intents.has(proposal.id));
  }

  async forgetSpec(specId: string): Promise<boolean> {
    return this.withLock(specId, async () => {
      const { store } = this.deps;
      const spec = store.getSpec(specId);
      if (!spec) return false;
      if (store.listRuns(specId).some((run) => run.state === "running")) {
        throw new EngineError("Wait until the review finishes before forgetting this spec.");
      }
      if (this.pendingProposals(specId).length) {
        throw new EngineError("A proposal has an unfinished apply; restart reconciliation is required before forgetting this spec.");
      }
      const removed = store.deleteSpec(specId);
      if (removed) this.deps.changed(spec.projectId, null);
      return removed;
    });
  }

  /** A spec with live facts from disk. Updates staleness of pending proposals as a side effect. */
  async describeSpec(spec: SpecRecord): Promise<{ spec: Spec; content: string | null }> {
    return this.withLock(spec.id, async () => {
    const { store } = this.deps;
    let content: string | null = null;
    let hash: string | null = null;
    const root = await this.deps.projectRoot(spec.projectId);
    if (root !== null) {
      try {
        const file = await readInside(root, spec.path);
        if (!("missing" in file)) {
          content = file.content;
          hash = file.hash;
        }
      } catch (cause) {
        if (!(cause instanceof WorkspaceError)) throw cause;
      }
    }
    if (content !== null) {
      const title = titleOf(content, spec.title);
      if (title !== spec.title) store.updateSpecTitle(spec.id, title);
    }
    store.transaction(() => {
      store.staleProposals(spec.id, hash);
      this.releaseStaleFindings(spec.id);
    });
    const latest = store.latestRun(spec.id);
    return {
      content,
      spec: {
        id: spec.id,
        projectId: spec.projectId,
        path: spec.path,
        title: content !== null ? titleOf(content, spec.title) : spec.title,
        currentHash: hash,
        exists: content !== null,
        latestRun: latest
          ? {
              id: latest.id,
              state: latest.state,
              targetHash: latest.targetHash,
              stale: this.isStale(latest, hash),
              round: latest.round,
              createdAt: latest.createdAt,
            }
          : null,
        openFindings: store.countFindings(spec.id, UNRESOLVED_FINDING_STATES),
        pendingDecisions: store.countFindings(spec.id, ["open", "contested", "proposal_pending"]),
        createdAt: spec.createdAt,
      },
    };
    });
  }

  private releaseStaleFindings(specId: string): void {
    const { store } = this.deps;
    for (const p of store.listProposals(specId)) {
      if ((p.state === "stale" || p.state === "conflict") && !store.listApplyIntents().some((intent) => intent.proposalId === p.id)) {
        for (const id of p.findingIds) {
          const f = store.getFinding(id);
          if (f?.state === "proposal_pending" && f.proposalId === p.id) store.setFindingState(id, "fix_requested", null);
        }
      }
    }
  }

  /**
   * A run is stale when the document no longer has the version the run knows:
   * its reviewed version, or the result of a change applied from this run.
   */
  isStale(run: Run, currentHash: string | null): boolean {
    const applied = this.deps.store
      .listProposals(run.specId)
      .filter((p) => p.runId === run.id && p.state === "applied")
      .sort((a, b) => (a.appliedAt ?? 0) - (b.appliedAt ?? 0));
    const known = applied.length > 0 ? applied[applied.length - 1]!.resultHash : run.targetHash;
    return currentHash !== known;
  }

  withStale(run: Run, currentHash: string | null): Run {
    return { ...run, stale: this.isStale(run, currentHash) };
  }

  // --- runs --------------------------------------------------------------

  async startRun(specId: string, options: StartOptions, parentRunId: string | null = null): Promise<Run> {
    const { store } = this.deps;
    const spec = store.getSpec(specId);
    if (!spec) throw new EngineError("Unknown spec.");
    const status = await this.deps.goldfish.status();
    if (!status.ready) throw new EngineError(`Goldfish review is unavailable: ${status.reason}`);
    return this.withLock(spec.id, async () => {
      if (!store.getSpec(spec.id)) throw new EngineError("Unknown spec.");
      if (this.pendingProposals(spec.id).length) {
        throw new EngineError("A proposal has an unfinished apply; restart reconciliation is required.");
      }
      if (parentRunId) {
        const existing = store.listRuns(spec.id).find((r) => r.parentRunId === parentRunId);
        if (existing) return existing;
      }
      const active = store.listRuns(spec.id).find((r) => r.state === "running");
      if (active) throw new EngineError("A review of this spec is already running. Cancel it or wait for it to finish.");
      const root = await this.root(spec.projectId);
      const file = await readInside(root, spec.path);
      if ("missing" in file) throw new EngineError(`The spec file is missing: ${spec.path}`);
      if (parentRunId) {
        const applied = store.listProposals(spec.id).filter((p) => p.runId === parentRunId && p.state === "applied")
          .sort((a, b) => (a.appliedAt ?? 0) - (b.appliedAt ?? 0));
        if (!applied.length || file.hash !== applied[applied.length - 1]!.resultHash) {
          store.setRunState(parentRunId, ["completed"], "stale", "the document changed before the next round; start a fresh review", true);
          this.event(spec, parentRunId, "run.stale", "The document changed before the next round; start a fresh review");
          this.deps.changed(spec.projectId, spec.id);
          throw new EngineError("The document changed before the next round; start a fresh review.");
        }
      }
      for (const ctx of options.context) await resolveInside(root, ctx);
      const parent = parentRunId ? store.getRun(parentRunId) : null;
      const round = parent ? parent.round + 1 : 1;
      const runId = newId();
      const stem = spec.path.replace(/\.md$/i, "").replaceAll("/", "__");
      const run: Run = {
        id: runId,
        specId: spec.id,
        projectId: spec.projectId,
        preset: options.preset,
        round,
        maxRounds: options.maxRounds,
        state: "running",
        stateReason: null,
        targetHash: file.hash,
        stale: false,
        context: options.context,
        threadId: options.threadId,
        parentRunId,
        reportDir: `${REPORT_ROOT}/${stem}/${runId}`,
        createdAt: Date.now(),
        finishedAt: null,
      };
      const plans = presetStages(options.preset, options.lenses, options.standard);
      store.transaction(() => {
        store.insertRun(run);
        // A new round supersedes older unresolved findings and proposals.
        for (const waiting of store.listRuns(spec.id).filter((r) => r.id !== run.id && r.state === "awaiting_decisions")) {
          store.setRunState(waiting.id, ["awaiting_decisions"], "stale", "superseded by a new review", true);
        }
        store.supersedeUnresolvedFindings(spec.id, run.id);
        store.supersedePendingProposals(spec.id, run.id);
        plans.forEach((plan, position) =>
          store.insertStage({
            id: newId(),
            runId,
            round,
            position,
            lens: plan.lens,
            standard: plan.standard,
            state: "pending",
            provider: null,
            error: null,
            reportPath: null,
            startedAt: null,
            finishedAt: null,
          }),
        );
      });
      this.event(spec, runId, "run.started", `Round ${round} (${options.preset}) started on version ${file.hash.slice(0, 12)}`);
      this.deps.changed(spec.projectId, spec.id);
      const controller = new AbortController();
      this.running.set(runId, controller);
      const execution = this.execute(spec, run, controller.signal)
        .catch((cause: unknown) => {
          this.deps.log.warn(`run ${runId} crashed: ${String(cause)}`);
          store.setRunState(runId, ["running"], "failed", `internal error: ${String(cause)}`, true);
          this.event(spec, runId, "run.failed", `Internal error: ${String(cause)}`);
        })
        .finally(() => {
          this.running.delete(runId);
          this.deps.changed(spec.projectId, spec.id);
        });
      this.track(execution);
      return run;
    });
  }

  cancelRun(runId: string): Run {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new EngineError("Unknown run.");
    const controller = this.running.get(runId);
    if (controller) controller.abort();
    if (store.setRunState(runId, ["running", "awaiting_decisions"], "cancelled", "cancelled by the user", true)) {
      for (const stage of store.listStages(runId)) {
        if (stage.state === "pending" || stage.state === "running") {
          store.updateStage(stage.id, { state: "cancelled", finishedAt: Date.now() });
        }
      }
      const spec = store.getSpec(run.specId);
      if (spec) this.event(spec, runId, "run.cancelled", "Cancelled by the user");
    }
    this.deps.changed(run.projectId, run.specId);
    return store.getRun(runId)!;
  }

  private async readContext(root: string, files: string[]): Promise<{ files: ContextFile[]; notes: string[] }> {
    const out: ContextFile[] = [];
    const notes: string[] = [];
    let budget = MAX_CONTEXT_BYTES;
    for (const rel of files) {
      try {
        const file = await readInside(root, rel);
        if ("missing" in file) {
          notes.push(`context file missing: ${rel}`);
          continue;
        }
        if (file.content.length > budget) {
          notes.push(`context file omitted, over the size budget: ${rel}`);
          continue;
        }
        budget -= file.content.length;
        out.push({ path: rel, content: file.content });
      } catch (cause) {
        notes.push(`context file refused: ${rel} (${(cause as Error).message})`);
      }
    }
    return { files: out, notes };
  }

  private async execute(spec: SpecRecord, run: Run, signal: AbortSignal): Promise<void> {
    const { store, goldfish } = this.deps;
    const root = await this.root(spec.projectId);
    const context = await this.readContext(root, run.context);
    for (const note of context.notes) this.event(spec, run.id, "context", note);
    const stages = store.listStages(run.id);
    // Upstream egm_review runs its stages in sequence (the intermediate zoom out reads earlier
    // reports); the brainstorm swarm and custom reviewer sets are independent and run in parallel.
    const parallel = run.preset === "brainstorm" || run.preset === "custom";
    const reports: { lens: LensId; text: string }[] = [];
    let failure: { state: RunState; reason: string } | null = null;

    const runStage = async (stage: (typeof stages)[number]): Promise<void> => {
      if (signal.aborted || failure) {
        store.updateStage(stage.id, { state: signal.aborted ? "cancelled" : "skipped", finishedAt: Date.now() });
        return;
      }
      // Re-read the target before every stage: an edit mid-run makes the run stale, not wrong.
      const file = await readInside(root, spec.path);
      if ("missing" in file || file.hash !== run.targetHash) {
        failure = { state: "stale", reason: "the document changed during the review; the remaining stages did not run" };
        store.updateStage(stage.id, { state: "skipped", finishedAt: Date.now() });
        return;
      }
      store.updateStage(stage.id, { state: "running", startedAt: Date.now() });
      this.deps.changed(spec.projectId, spec.id);
      const messages = stageMessages({
        plan: { lens: stage.lens, standard: stage.standard },
        mode: run.preset === "brainstorm" ? "BRAINSTORM" : "REVIEW",
        specPath: spec.path,
        specContent: file.content,
        context: context.files,
        earlierReports: parallel ? [] : stage.lens === "zoom_out" && stage.position > 0 ? [...reports] : [],
      });
      const result = await goldfish.complete(messages, signal);
      if (!result.ok) {
        const state = result.kind === "cancelled" ? "cancelled" : "failed";
        store.updateStage(stage.id, { state, error: result.error, finishedAt: Date.now() });
        if (!failure) {
          failure = {
            state: result.kind === "cancelled" ? "cancelled" : result.kind === "limit" ? "limit_reached" : "failed",
            reason: `${stage.lens} stage: ${result.error}`,
          };
        }
        return;
      }
      if (signal.aborted) {
        store.updateStage(stage.id, { state: "cancelled", finishedAt: Date.now() });
        return;
      }
      reports.push({ lens: stage.lens, text: result.text });
      const reportPath = `${run.reportDir}/round-${run.round}/${String(stage.position + 1).padStart(2, "0")}-${stage.lens}.md`;
      const header = [
        `# Goldfish report: ${stage.lens}`,
        "",
        `- Spec: \`${spec.path}\``,
        `- Reviewed version: \`${run.targetHash}\``,
        `- Standard: \`${stage.standard}\``,
        `- Model: \`${result.model}\` (tool-less, fresh context)`,
        result.truncated ? "- **The model stopped at its output limit; this report may be incomplete.**" : null,
        "",
        "---",
        "",
      ].filter((l) => l !== null);
      await writeReport(root, reportPath, header.join("\n") + result.text + "\n");
      if (signal.aborted) {
        store.updateStage(stage.id, { state: "cancelled", finishedAt: Date.now() });
        return;
      }
      const parsed = parseFindings(result.text);
      const now = Date.now();
      store.transaction(() => {
        const items =
          parsed ??
          // Unparseable report: keep it whole as one finding so nothing is dropped silently.
          [{ severity: "unknown" as const, rawSeverity: "(unparsed)", title: `Unstructured ${stage.lens} report`, body: result.text, lineStart: null, lineEnd: null }];
        for (const item of items) {
          store.insertFinding(
            {
              id: newId(),
              runId: run.id,
              stageId: stage.id,
              round: run.round,
              lens: stage.lens,
              severity: item.severity,
              rawSeverity: item.rawSeverity,
              title: item.title,
              body: item.body,
              lineStart: item.lineStart,
              lineEnd: item.lineEnd,
              state: "open",
              decision: null,
              elephantNote: null,
              proposalId: null,
              createdAt: now,
            },
            spec.id,
          );
        }
        store.updateStage(stage.id, {
          state: "completed",
          provider: result.model,
          reportPath,
          rawReport: result.text,
          finishedAt: now,
          ...(result.truncated ? { error: "output limit reached; report may be incomplete" } : {}),
        });
      });
      if (result.truncated && !failure) {
        failure = { state: "limit_reached", reason: `${stage.lens} stage stopped at the model's output limit` };
      }
      this.deps.changed(spec.projectId, spec.id);
    };

    if (parallel) await Promise.all(stages.map(runStage));
    else for (const stage of stages) await runStage(stage);
    if (!failure && !signal.aborted) {
      const finalFile = await readInside(root, spec.path);
      if ("missing" in finalFile || finalFile.hash !== run.targetHash) {
        failure = { state: "stale", reason: "the document changed during the review" };
      }
    }

    const done = failure as { state: RunState; reason: string } | null;
    if (done) {
      store.setRunState(run.id, ["running"], done.state, `${done.reason}; partial results are kept`, true);
      this.event(spec, run.id, `run.${done.state}`, done.reason);
    } else {
      const unresolved = store.listFindingsForRun(run.id).some((f) => UNRESOLVED_FINDING_STATES.includes(f.state));
      if (unresolved) {
        store.setRunState(run.id, ["running"], "awaiting_decisions", "findings wait for decisions", false);
        this.event(spec, run.id, "run.awaiting", "All stages reported; findings wait for decisions");
      } else {
        store.setRunState(run.id, ["running"], "completed", "no findings", true);
        this.event(spec, run.id, "run.completed", "All stages reported no findings");
      }
    }
    await this.writeSummary(spec, store.getRun(run.id)!);
  }

  /** The round's resolution record, rewritten whenever it changes. */
  private async writeSummary(spec: SpecRecord, run: Run): Promise<void> {
    const root = await this.deps.projectRoot(spec.projectId);
    if (root === null) return;
    const { store } = this.deps;
    const findings = store.listFindingsForRun(run.id);
    const proposals = store.listProposals(spec.id).filter((p) => p.runId === run.id);
    const lines = [
      `# Goldfish review report: ${spec.title}`,
      "",
      `- Spec: \`${spec.path}\``,
      `- Run: \`${run.id}\`, round ${run.round} of at most ${run.maxRounds}, preset \`${run.preset}\``,
      `- Reviewed version: \`${run.targetHash}\``,
      `- State: **${run.state}**${run.stateReason ? ` (${run.stateReason})` : ""}`,
      "",
      "| Severity | Lens | Finding | State | Decision |",
      "|---|---|---|---|---|",
      ...findings.map(
        (f) =>
          `| ${f.severity} | ${f.lens} | ${f.title.replaceAll("|", "\\|")} | ${f.state} | ${
            f.decision ? `${f.decision.kind}${f.decision.rationale ? `: ${f.decision.rationale.replaceAll("|", "\\|").replaceAll("\n", " ")}` : ""}` : ""
          } |`,
      ),
      "",
      "## Proposals",
      "",
      ...(proposals.length === 0
        ? ["None."]
        : proposals.map((p) => `- \`${p.id}\` ${p.state}${p.stateReason ? ` (${p.stateReason})` : ""}: ${p.summary}`)),
      "",
    ];
    await writeReport(root, `${run.reportDir}/goldfish_review_report.md`, lines.join("\n"));
  }

  // --- decisions and proposals ---------------------------------------------

  async decide(findingId: string, kind: DecisionKind, rationale: string, decidedBy: string, opId: string): Promise<Finding> {
    const { store } = this.deps;
    const prior = store.getOperation<Finding>(opId);
    if (prior) return prior;
    const finding = store.getFinding(findingId);
    if (!finding) throw new EngineError("Unknown finding.");
    const spec = store.getSpec(finding.specId)!;
    return this.withLock(spec.id, async () => {
      const prior = store.getOperation<Finding>(opId);
      if (prior) return prior;
      const current = store.getFinding(findingId)!;
      if (this.pendingProposals(spec.id).some((proposal) => proposal.findingIds.includes(current.id))) {
        throw new EngineError("This proposal has an unfinished apply; restart reconciliation is required.");
      }
      if (store.getRun(current.runId)?.state === "running") throw new EngineError("Wait until the review finishes before deciding findings.");
      if (!UNRESOLVED_FINDING_STATES.includes(current.state)) {
        throw new EngineError(`This finding is already ${current.state}.`);
      }
      if (kind === "accept_tradeoff" && rationale.trim() === "") {
        throw new EngineError("Accepting a trade-off needs a reason, so the kept risk stays understandable.");
      }
      const state = kind === "request_fix" ? "fix_requested" : kind === "accept_tradeoff" ? "accepted_tradeoff" : "dismissed";
      const result = store.transaction(() => {
        if (current.proposalId) {
          const rejected = store.getProposal(current.proposalId);
          store.setProposalState(current.proposalId, ["proposed"], "rejected", `finding decision: ${kind}`);
          for (const id of rejected?.findingIds ?? []) {
            const linked = store.getFinding(id);
            if (id !== findingId && linked?.state === "proposal_pending" && linked.proposalId === current.proposalId) {
              store.setFindingState(id, "fix_requested", null);
            }
          }
        }
        store.setFindingDecision(findingId, state, { kind, rationale, decidedBy, decidedAt: Date.now() });
        const updated = store.getFinding(findingId)!;
        const { specId: _specId, ...plain } = updated;
        store.putOperation(opId, "decide", plain);
        return plain;
      });
      this.event(spec, current.runId, "finding.decided", `${kind} on "${current.title}"`);
      await this.afterResolution(spec, current.runId);
      this.deps.changed(spec.projectId, spec.id);
      return result;
    });
  }

  /** Elephant: argue a finding does not apply. The human still decides. */
  async contest(findingId: string, rationale: string): Promise<Finding> {
    const { store } = this.deps;
    const finding = store.getFinding(findingId);
    if (!finding) throw new EngineError("Unknown finding.");
    return this.withLock(finding.specId, async () => {
      const current = store.getFinding(findingId);
      if (!current) throw new EngineError("Unknown finding.");
      if (this.pendingProposals(current.specId).some((proposal) => proposal.findingIds.includes(findingId))) {
        throw new EngineError("This proposal has an unfinished apply; restart reconciliation is required.");
      }
      if (!["open", "fix_requested"].includes(current.state)) throw new EngineError(`This finding is ${current.state}; it cannot be contested now.`);
      if (rationale.trim() === "") throw new EngineError("A contest needs a rationale.");
      store.setElephantNote(findingId, "contested", rationale);
      const spec = store.getSpec(current.specId)!;
      this.event(spec, current.runId, "finding.contested", `Elephant contested "${current.title}"`);
      this.deps.changed(spec.projectId, spec.id);
      const { specId: _specId, ...plain } = store.getFinding(findingId)!;
      return plain;
    });
  }

  /**
   * Elephant: propose a full new version of the spec addressing findings.
   * The proposal is bound to the exact content it was computed against.
   */
  async propose(specId: string, findingIds: string[], newContent: string, summary: string, author: string): Promise<Proposal> {
    const { store } = this.deps;
    const spec = store.getSpec(specId);
    if (!spec) throw new EngineError("Unknown spec.");
    if (findingIds.length === 0) throw new EngineError("A proposal must address at least one finding.");
    return this.withLock(spec.id, async () => {
      const root = await this.root(spec.projectId);
      const file = await readInside(root, spec.path);
      if ("missing" in file) throw new EngineError(`The spec file is missing: ${spec.path}`);
      if (file.content === newContent) throw new EngineError("The proposed content is identical to the current document.");
      const findings = findingIds.map((id) => store.getFinding(id));
      let runId: string | null = null;
      for (const f of findings) {
        if (!f || f.specId !== spec.id) throw new EngineError("Every finding must belong to this spec.");
        if (this.pendingProposals(spec.id).some((proposal) => proposal.findingIds.includes(f.id))) {
          throw new EngineError("This proposal has an unfinished apply; restart reconciliation is required.");
        }
        if (store.getRun(f.runId)?.state === "running") throw new EngineError("Wait until the review finishes before proposing changes to its findings.");
        if (!["open", "fix_requested", "contested"].includes(f.state)) throw new EngineError(`Finding "${f.title}" is ${f.state}.`);
        runId = f.runId;
      }
      const proposal: Proposal = {
        id: newId(),
        specId: spec.id,
        runId,
        findingIds,
        baseHash: file.hash,
        resultHash: sha256(newContent),
        diff: unifiedDiff(spec.path, file.content, newContent),
        summary: summary.slice(0, 2000),
        author,
        state: "proposed",
        stateReason: null,
        appliedAt: null,
        backupPath: null,
        createdAt: Date.now(),
      };
      store.transaction(() => {
        store.insertProposal(proposal, newContent);
        for (const id of findingIds) store.setFindingState(id, "proposal_pending", proposal.id);
      });
      this.event(spec, runId, "proposal.created", `Proposal ${proposal.id}: ${summary.slice(0, 200)}`);
      this.deps.changed(spec.projectId, spec.id);
      return proposal;
    });
  }

  async rejectProposal(proposalId: string, reason: string): Promise<Proposal> {
    const { store } = this.deps;
    const proposal = store.getProposal(proposalId);
    if (!proposal) throw new EngineError("Unknown proposal.");
    return this.withLock(proposal.specId, async () => {
    store.transaction(() => {
      if (store.listApplyIntents().some((intent) => intent.proposalId === proposalId)) {
        throw new EngineError("This proposal has an unfinished apply; restart reconciliation is required.");
      }
      if (!store.setProposalState(proposalId, ["proposed", "stale"], "rejected", reason || "rejected by the user")) {
        throw new EngineError(`This proposal is ${store.getProposal(proposalId)!.state}.`);
      }
      for (const id of proposal.findingIds) {
        const f = store.getFinding(id);
        if (f?.state === "proposal_pending" && f.proposalId === proposalId) store.setFindingState(id, "fix_requested", null);
      }
    });
    const spec = store.getSpec(proposal.specId)!;
    this.event(spec, proposal.runId, "proposal.rejected", `Proposal ${proposalId} rejected${reason ? `: ${reason}` : ""}`);
    this.deps.changed(spec.projectId, spec.id);
    const { resultContent: _content, ...plain } = store.getProposal(proposalId)!;
    return plain;
    });
  }

  /** Apply a human-confirmed proposal against the exact version they saw. */
  async applyProposal(proposalId: string, seenBaseHash: string, opId: string): Promise<Proposal> {
    const { store } = this.deps;
    const prior = store.getOperation<Proposal>(opId);
    if (prior) return prior;
    const initial = store.getProposal(proposalId);
    if (!initial) throw new EngineError("Unknown proposal.");
    return this.withLock(initial.specId, async () => {
      const prior = store.getOperation<Proposal>(opId);
      if (prior) return prior;
      const proposal = store.getProposal(proposalId);
      if (!proposal) throw new EngineError("Unknown proposal.");
      if (proposal.state !== "proposed") throw new EngineError(`This proposal is ${proposal.state}.`);
      if (proposal.findingIds.some((id) => {
        const finding = store.getFinding(id);
        return finding && store.getRun(finding.runId)?.state === "running";
      })) throw new EngineError("Wait until the review finishes before applying changes to its findings.");
      if (seenBaseHash !== proposal.baseHash) throw new EngineError("The confirmed version does not match this proposal's base version.");
      if (this.pendingProposals(proposal.specId).length) {
        throw new EngineError("A proposal has an unfinished apply; restart reconciliation is required.");
      }
      const spec = store.getSpec(proposal.specId)!;
      const root = await this.root(spec.projectId);
      const target = await resolveInside(root, spec.path);
      const plan = planApply(target, proposal.id);
      const outcome = await compareAndReplace(plan, proposal.baseHash, proposal.resultContent, () => {
        store.putApplyIntent({ proposalId, ...plan, baseHash: proposal.baseHash, resultHash: proposal.resultHash, createdAt: Date.now(), operationId: opId });
      });
      const result = store.transaction(() => {
        const state = outcome.kind === "applied" ? "applied" : outcome.kind;
        const reason = outcome.kind === "applied" ? null : outcome.reason;
        const backupPath = outcome.kind === "applied" ? outcome.backupPath : outcome.kind === "conflict" ? outcome.backupPath : null;
        if (!store.setProposalState(proposalId, ["proposed"], state, reason, {
          ...(outcome.kind === "applied" ? { appliedAt: Date.now() } : {}),
          ...(backupPath ? { backupPath } : {}),
        })) throw new EngineError("Proposal state changed during apply; the apply intent was retained.");
        store.deleteApplyIntent(proposalId);
        if (outcome.kind === "applied") {
          for (const id of proposal.findingIds) store.setFindingState(id, "fixed");
        } else {
          this.releaseStaleFindings(spec.id);
        }
        const { resultContent: _content, ...plain } = store.getProposal(proposalId)!;
        store.putOperation(opId, "apply", plain);
        return plain;
      });
      this.event(spec, proposal.runId, `proposal.${result.state}`, result.stateReason ?? `Proposal ${proposalId} applied`);
      if (outcome.kind === "applied" && proposal.runId) await this.afterResolution(spec, proposal.runId);
      this.deps.changed(spec.projectId, spec.id);
      return result;
    });
  }

  /**
   * After a decision or an apply: finish the round when nothing is unresolved,
   * and start the next round when a confirmed change was applied in it.
   */
  private async afterResolution(spec: SpecRecord, runId: string): Promise<void> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) return;
    await this.writeSummary(spec, run);
    if (run.state !== "awaiting_decisions") return;
    const findings = store.listFindingsForRun(runId);
    if (findings.some((f) => UNRESOLVED_FINDING_STATES.includes(f.state))) return;
    const applied = store.listProposals(spec.id).some((p) => p.runId === runId && p.state === "applied");
    if (!applied) {
      store.setRunState(runId, ["awaiting_decisions"], "completed", "all findings decided; nothing was changed", true);
      this.event(spec, runId, "run.completed", "All findings decided without changes");
      await this.writeSummary(spec, store.getRun(runId)!);
      return;
    }
    if (run.round >= run.maxRounds) {
      store.setRunState(
        runId,
        ["awaiting_decisions"],
        "limit_reached",
        `round limit (${run.maxRounds}) reached: the changed document was not re-reviewed`,
        true,
      );
      this.event(spec, runId, "run.limit_reached", "Round limit reached; the changed version was not reviewed again");
      await this.writeSummary(spec, store.getRun(runId)!);
      return;
    }
    store.setRunState(runId, ["awaiting_decisions"], "completed", `continued in round ${run.round + 1}`, true);
    await this.writeSummary(spec, store.getRun(runId)!);
    this.scheduleContinuation(spec, run);
  }

  private scheduleContinuation(spec: SpecRecord, run: Run): void {
    const { store } = this.deps;
    const runId = run.id;
    // Start after this lock is released: startRun takes the same lock.
    this.track(
      Promise.resolve().then(() =>
        this.startRun(
          spec.id,
          {
            preset: run.preset,
            context: run.context,
            maxRounds: run.maxRounds,
            threadId: run.threadId,
            ...(run.preset === "custom" ? {
              lenses: store.listStages(runId).map((stage) => stage.lens),
              standard: store.listStages(runId)[0]?.standard,
            } : {}),
          },
          runId,
        ).catch((cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause);
          if (store.getRun(runId)?.state === "stale") return;
          store.setRunState(runId, ["completed"], "failed", `the next round could not start: ${message}`, true);
          this.event(spec, runId, "run.failed", `Next round could not start: ${message}`);
          this.deps.changed(spec.projectId, spec.id);
        }),
      ),
    );
  }

  // --- restart reconciliation ----------------------------------------------

  /** Called once on load: settle what a previous process left unfinished. */
  async reconcile(): Promise<void> {
    const { store } = this.deps;
    for (const intent of store.listApplyIntents()) {
      const proposal = store.getProposal(intent.proposalId);
      if (!proposal) {
        this.deps.log.warn(`Unfinished apply ${intent.proposalId} has no proposal; the intent and workspace files were retained for manual recovery.`);
        store.addEvent(null, null, "proposal.reconciliation_failed", `Unfinished apply ${intent.proposalId} has no proposal; the intent and workspace files were retained for manual recovery.`);
        continue;
      }
      const result = await reconcileApply(
        { targetPath: intent.targetPath, backupPath: intent.backupPath, stagedPath: intent.stagedPath },
        intent.baseHash,
        intent.resultHash,
      );
      store.transaction(() => {
        if (result.state === "applied") {
          if (!store.setProposalState(proposal.id, ["proposed", "stale"], "applied", result.reason, { appliedAt: Date.now(), backupPath: intent.backupPath })) {
            throw new EngineError("Proposal state changed during reconciliation; the apply intent was retained.");
          }
          for (const id of proposal.findingIds) {
            const finding = store.getFinding(id);
            if (finding && ((finding.proposalId === proposal.id && finding.state === "proposal_pending") || (finding.proposalId === null && finding.state === "fix_requested"))) store.setFindingState(id, "fixed");
          }
          if (intent.operationId && !store.getOperation(intent.operationId)) {
            const { resultContent: _content, ...plain } = store.getProposal(proposal.id)!;
            store.putOperation(intent.operationId, "apply", plain);
          }
        } else if (result.state === "unknown") {
          if (!store.setProposalState(proposal.id, ["proposed", "stale"], "unknown", result.reason, { backupPath: intent.backupPath })) {
            throw new EngineError("Proposal state changed during reconciliation; the apply intent was retained.");
          }
          for (const id of proposal.findingIds) {
            const finding = store.getFinding(id);
            if (finding?.proposalId === proposal.id && finding.state === "proposal_pending") store.setFindingState(id, "fix_requested", null);
          }
        }
        // not_applied: the proposal stays proposed and may be applied again by the human.
        store.deleteApplyIntent(intent.proposalId);
      });
      const spec = proposal ? store.getSpec(proposal.specId) : null;
      if (spec) this.event(spec, proposal!.runId, "proposal.reconciled", result.reason);
    }
    for (const run of store.listRunsByState(["running"])) {
      store.transaction(() => {
        for (const stage of store.listStages(run.id)) {
          if (stage.state === "running" || stage.state === "pending") {
            store.updateStage(stage.id, { state: "failed", error: "interrupted by a BB restart", finishedAt: Date.now() });
          }
        }
        store.setRunState(run.id, ["running"], "failed", "interrupted by a BB restart; partial results are kept", true);
      });
      const spec = store.getSpec(run.specId);
      if (spec) this.event(spec, run.id, "run.failed", "Interrupted by a BB restart");
    }
    for (const run of store.listRunsByState(["awaiting_decisions", "completed"])) {
      const spec = store.getSpec(run.specId);
      if (!spec) continue;
      if (run.state === "awaiting_decisions") {
        await this.withLock(spec.id, () => this.afterResolution(spec, run.id));
      } else if (run.stateReason === `continued in round ${run.round + 1}` &&
        !store.listRuns(spec.id).some((child) => child.parentRunId === run.id)) {
        this.scheduleContinuation(spec, run);
      }
    }
  }

  /** Resolve once all background work, including rounds it starts, has finished. */
  async settle(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  dispose(): void {
    for (const controller of this.running.values()) controller.abort();
  }
}
