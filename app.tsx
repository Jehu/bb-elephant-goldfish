// Elephant Goldfish — BB plugin frontend.
//
// Two surfaces share one spec view:
// - "Spec workspace" page in the sidebar: pick a project, see every spec.
// - "Elephant Goldfish" tab beside a thread: the thread's project, and a
//   button that asks this thread (the Elephant) to resolve findings.
// Decisions and applying a proposal happen only here, by the human.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Markdown,
  definePluginApp,
  experimental_Diff as Diff,
  useBbNavigate,
  useRealtime,
  useBbContext,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type {
  DecisionKind,
  EventRow,
  Finding,
  FindingState,
  LensId,
  PresetId,
  StandardId,
  Proposal,
  ReviewerStatus,
  Run,
  RunState,
  RpcContract,
  Spec,
  Stage,
} from "./server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CHANGED = "egm-changed";

type Detail = {
  spec: Spec;
  content: string | null;
  runs: Run[];
  stages: Stage[];
  findings: Finding[];
  proposals: Proposal[];
  events: EventRow[];
};

const opId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 32);
const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const time = (at: number | null) => (at === null ? "" : new Date(at).toLocaleString());

const RUN_LABEL: Record<RunState, string> = {
  running: "Running",
  awaiting_decisions: "Waiting for your decisions",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  limit_reached: "Limit reached",
  stale: "Stopped: document changed",
  unknown: "Unknown",
};
const RUN_TONE: Record<RunState, string> = {
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  awaiting_decisions: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  limit_reached: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  stale: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  unknown: "bg-red-500/15 text-red-600 dark:text-red-400",
};
const FINDING_LABEL: Record<FindingState, string> = {
  open: "Open",
  fix_requested: "Fix requested",
  contested: "Contested by Elephant",
  proposal_pending: "Change proposed",
  fixed: "Fixed",
  accepted_tradeoff: "Accepted trade-off",
  dismissed: "Dismissed",
  superseded: "Superseded",
};
const SEVERITY_TONE: Record<string, string> = {
  blocker: "bg-red-500/15 text-red-600 dark:text-red-400",
  major: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  nit: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  unknown: "bg-muted text-muted-foreground",
};
const LENS_LABEL: Record<LensId, string> = {
  zoom_out: "Zoom out",
  comprehension: "Comprehension",
  design_critic: "Design critic",
  implementation_readiness: "Implementation readiness",
  structural: "Structural",
  style: "Style",
  codebase_details: "Codebase details",
};
const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: "full", label: "Full review", hint: "Zoom out, comprehension, critic, zoom out, implementation readiness" },
  { id: "feature_spec", label: "Feature spec", hint: "Stages 5–8, no implementation readiness" },
  { id: "implementation", label: "Implementation plan", hint: "Implementation readiness only" },
  { id: "brainstorm", label: "Brainstorm lenses", hint: "Six lenses on a concepts brief" },
  { id: "custom", label: "Custom reviewers", hint: "Choose reviewers and a standard, run in parallel" },
];
const STANDARD_LABEL: Record<StandardId, string> = {
  "feature-spec-standard": "Feature spec",
  "implementation-readiness-standard": "Implementation readiness",
  "zoom-out-standard": "Zoom out",
  "heilmeier-standard": "Heilmeier",
  "re-implementation-standard": "Re-implementation",
};

function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-sm text-red-600 dark:text-red-400">
      {error}
    </p>
  );
}

function useReviewer() {
  const rpc = useRpc<RpcContract>();
  const [status, setStatus] = useState<ReviewerStatus | null>(null);
  useEffect(() => {
    rpc.call("reviewer_status").then(setStatus, (cause) =>
      setStatus({ ready: false, reason: errorText(cause), model: null, endpoint: null }),
    );
  }, [rpc]);
  return status;
}

function ReviewerBanner({ status }: { status: ReviewerStatus | null }) {
  if (status === null) return null;
  if (status.ready) {
    return (
      <p className="text-xs text-muted-foreground">
        Goldfish: <span className="font-mono">{status.model}</span> — fresh context, no tools, read-only.
      </p>
    );
  }
  return (
    <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-700 dark:text-amber-400">
      Goldfish review is unavailable: {status.reason}
    </p>
  );
}

// --- spec list -------------------------------------------------------------

function SpecRow({ spec, onOpen }: { spec: Spec; onOpen: () => void }) {
  const run = spec.latestRun;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-state-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{spec.title}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{spec.path}</div>
        </div>
        {!spec.exists && <Badge className="bg-red-500/15 text-red-600">File missing</Badge>}
        {run ? (
          <>
            <Badge className={RUN_TONE[run.state]}>{RUN_LABEL[run.state]}</Badge>
            {run.stale && run.state !== "running" && <Badge className="bg-orange-500/15 text-orange-700">Outdated</Badge>}
          </>
        ) : (
          <Badge className="bg-muted text-muted-foreground">Not reviewed</Badge>
        )}
        {spec.pendingDecisions > 0 && (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{spec.pendingDecisions} to decide</Badge>
        )}
      </button>
    </li>
  );
}

function RegisterSpec({ projectId, onDone }: { projectId: string; onDone: (spec: Spec) => void }) {
  const rpc = useRpc<RpcContract>();
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!path.trim()) return;
        rpc.call("specs_register", { projectId, path: path.trim() }).then(
          (spec) => {
            setPath("");
            setError(null);
            onDone(spec);
          },
          (cause) => setError(errorText(cause)),
        );
      }}
    >
      <div className="flex gap-2">
        <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="docs/designs/feature.md" aria-label="Spec path" />
        <Button type="submit" variant="outline" disabled={!path.trim()}>
          Add spec
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

function SpecList({ projectId, onOpen }: { projectId: string; onOpen: (specId: string) => void }) {
  const rpc = useRpc<RpcContract>();
  const [specs, setSpecs] = useState<Spec[] | null>(null);
  const [root, setRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("specs_list", { projectId }).then(
      (result) => {
        setSpecs(result.specs);
        setRoot(result.root);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, projectId]);
  useEffect(load, [load]);
  useRealtime(CHANGED, (payload) => {
    if (payload && typeof payload === "object" && "projectId" in payload && payload.projectId === projectId) load();
  });
  return (
    <div className="space-y-3">
      <ErrorLine error={error} />
      {root === null && specs !== null && (
        <p className="text-sm text-muted-foreground">This project has no checkout on this machine; specs cannot be read here.</p>
      )}
      {specs === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : specs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No specs yet. Add a Markdown file, or ask the agent to use an egm skill.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {specs.map((spec) => (
            <SpecRow key={spec.id} spec={spec} onOpen={() => onOpen(spec.id)} />
          ))}
        </ul>
      )}
      {root !== null && <RegisterSpec projectId={projectId} onDone={(spec) => onOpen(spec.id)} />}
    </div>
  );
}

// --- spec detail -------------------------------------------------------------

function StartReview({ spec, threadId, reviewer }: { spec: Spec; threadId: string | null; reviewer: ReviewerStatus | null }) {
  const rpc = useRpc<RpcContract>();
  const [preset, setPreset] = useState<PresetId>("full");
  const [lenses, setLenses] = useState<LensId[]>(["design_critic", "structural"]);
  const [standard, setStandard] = useState<StandardId>("feature-spec-standard");
  const [context, setContext] = useState("");
  const [maxRounds, setMaxRounds] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = !reviewer?.ready || !spec.exists || busy || (preset === "custom" && lenses.length === 0);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.hint}
            aria-pressed={preset === p.id}
            onClick={() => setPreset(p.id)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              preset === p.id ? "border-foreground bg-foreground text-background" : "hover:bg-state-hover",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{PRESETS.find((p) => p.id === preset)?.hint}</p>
      {preset === "custom" && (
        <div className="space-y-2">
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
            <legend className="text-xs font-medium">Reviewers</legend>
            {(Object.keys(LENS_LABEL) as LensId[]).map((lens) => (
              <label key={lens} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={lenses.includes(lens)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLenses((current) => checked ? [...current, lens] : current.filter((item) => item !== lens));
                  }}
                />
                {LENS_LABEL[lens]}
              </label>
            ))}
          </fieldset>
          {lenses.length === 0 && <p className="text-xs text-muted-foreground">Select at least one reviewer.</p>}
          <label className="flex items-center gap-2 text-xs">
            Standard
            <select className="rounded-md border bg-transparent px-2 py-1" value={standard} onChange={(e) => setStandard(e.target.value as StandardId)}>
              {(Object.keys(STANDARD_LABEL) as StandardId[]).map((id) => <option key={id} value={id}>{STANDARD_LABEL[id]}</option>)}
            </select>
          </label>
        </div>
      )}
      <Input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Context files for the reviewers, comma-separated (optional)"
        aria-label="Context files"
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Rounds at most
          <Input
            type="number"
            min={1}
            max={10}
            value={maxRounds}
            onChange={(e) => setMaxRounds(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            className="h-8 w-16"
          />
        </label>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            setBusy(true);
            rpc
              .call("review_start", {
                specId: spec.id,
                preset,
                ...(preset === "custom" ? { lenses, standard } : {}),
                context: context
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                maxRounds,
                threadId,
              })
              .then(
                () => setError(null),
                (cause) => setError(errorText(cause)),
              )
              .finally(() => setBusy(false));
          }}
        >
          Start Goldfish review
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

function RunCard({ run, stages, onCancel }: { run: Run; stages: Stage[]; onCancel: () => void }) {
  const mine = stages.filter((s) => s.runId === run.id);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Round {run.round}</span>
        <Badge className={RUN_TONE[run.state]}>{RUN_LABEL[run.state]}</Badge>
        {run.stale && <Badge className="bg-orange-500/15 text-orange-700">Reviewed an older version</Badge>}
        <span className="text-xs text-muted-foreground">
          {run.preset} · version <span className="font-mono">{run.targetHash.slice(0, 10)}</span> · {time(run.createdAt)}
        </span>
        {(run.state === "running" || run.state === "awaiting_decisions") && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {run.stateReason && <p className="text-xs text-muted-foreground">{run.stateReason}</p>}
      <ol className="flex flex-wrap gap-1">
        {mine.map((stage) => (
          <li
            key={stage.id}
            title={stage.error ?? stage.reportPath ?? ""}
            className={cn(
              "rounded border px-2 py-0.5 text-xs",
              stage.state === "completed" && "border-emerald-500/40",
              stage.state === "running" && "animate-pulse border-blue-500/50",
              (stage.state === "failed" || stage.state === "cancelled") && "border-red-500/40 text-red-600",
              (stage.state === "skipped" || stage.state === "pending") && "text-muted-foreground",
            )}
          >
            {stage.position + 1}. {LENS_LABEL[stage.lens]} · {stage.state}
            {stage.error ? ` — ${stage.error}` : ""}
          </li>
        ))}
      </ol>
      {run.context.length > 0 && (
        <p className="text-xs text-muted-foreground">Context: {run.context.join(", ")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Reports: <span className="font-mono">{run.reportDir}/</span>
      </p>
    </div>
  );
}

function DecisionButtons({ finding, disabled, onDecide }: { finding: Finding; disabled: boolean; onDecide: (kind: DecisionKind, rationale: string) => void }) {
  const [mode, setMode] = useState<DecisionKind | null>(null);
  const [rationale, setRationale] = useState("");
  if (mode !== null) {
    const needsReason = mode === "accept_tradeoff";
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          onDecide(mode, rationale.trim());
          setMode(null);
          setRationale("");
        }}
      >
        <Input
          autoFocus
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder={needsReason ? "Why this risk is acceptable (required)" : "Reason (optional)"}
          className="h-8 min-w-60 flex-1"
        />
        <Button size="sm" type="submit" disabled={disabled || (needsReason && rationale.trim() === "")}>
          {mode === "request_fix" ? "Request fix" : mode === "accept_tradeoff" ? "Accept trade-off" : "Dismiss"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>
          Back
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {finding.state !== "fix_requested" && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode("request_fix")}>
          Request fix
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode("accept_tradeoff")}>
        Accept trade-off
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setMode("dismiss")}>
        Dismiss
      </Button>
    </div>
  );
}

function FindingCard({ finding, running, onDecide }: { finding: Finding; running: boolean; onDecide: (kind: DecisionKind, rationale: string) => void }) {
  const [open, setOpen] = useState(finding.state === "open" || finding.state === "contested");
  const decidable = ["open", "fix_requested", "contested"].includes(finding.state);
  return (
    <li className="space-y-2 rounded-md border p-3">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <Badge className={SEVERITY_TONE[finding.severity]}>{finding.rawSeverity === "(none)" ? finding.severity : finding.rawSeverity}</Badge>
        <span className="flex-1 text-sm font-medium">{finding.title}</span>
        <Badge className="bg-muted text-muted-foreground">{FINDING_LABEL[finding.state]}</Badge>
      </button>
      <div className="text-xs text-muted-foreground">
        {LENS_LABEL[finding.lens]} · round {finding.round}
        {finding.lineStart !== null ? ` · lines ${finding.lineStart}–${finding.lineEnd} of the reviewed version` : ""}
      </div>
      {open && (
        <>
          <div className="text-sm">
            <Markdown content={finding.body || "_No explanation given._"} />
          </div>
          {finding.elephantNote && (
            <div className="rounded border-l-2 border-blue-500/60 bg-blue-500/5 px-2 py-1 text-sm">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400">Elephant contests this</div>
              <Markdown content={finding.elephantNote} />
            </div>
          )}
          {finding.decision && (
            <p className="text-xs text-muted-foreground">
              Decided: {finding.decision.kind.replace("_", " ")}
              {finding.decision.rationale ? ` — ${finding.decision.rationale}` : ""} · {time(finding.decision.decidedAt)}
            </p>
          )}
          {decidable && <DecisionButtons finding={finding} disabled={running} onDecide={onDecide} />}
          {decidable && running && <p className="text-xs text-muted-foreground">Wait for this review to finish before deciding findings.</p>}
          {finding.state === "proposal_pending" && (
            <p className="text-xs text-muted-foreground">A proposed change for this finding waits for you below.</p>
          )}
        </>
      )}
    </li>
  );
}

function ProposalCard({ proposal, path, running, onApply, onReject }: { proposal: Proposal; path: string; running: boolean; onApply: () => void; onReject: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const pending = proposal.state === "proposed";
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Proposed change</span>
        <Badge
          className={
            proposal.state === "applied"
              ? "bg-emerald-500/15 text-emerald-700"
              : proposal.state === "proposed"
                ? "bg-amber-500/15 text-amber-700"
                : "bg-orange-500/15 text-orange-700"
          }
        >
          {proposal.state}
        </Badge>
        <span className="text-xs text-muted-foreground">
          against <span className="font-mono">{proposal.baseHash.slice(0, 10)}</span> · {proposal.findingIds.length} finding(s) · {time(proposal.createdAt)}
        </span>
      </div>
      <p className="text-sm">{proposal.summary}</p>
      {proposal.stateReason && <p className="text-xs text-muted-foreground">{proposal.stateReason}</p>}
      {proposal.backupPath && (
        <p className="text-xs text-muted-foreground">
          Previous version kept at <span className="font-mono">{proposal.backupPath}</span>
        </p>
      )}
      {(pending || proposal.state === "stale") && proposal.diff && <Diff patch={proposal.diff} path={path} />}
      {pending && running && <p className="text-xs text-muted-foreground">Wait for this review to finish before applying or rejecting this change.</p>}
      {pending &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded border border-amber-500/40 bg-amber-500/5 p-2">
            <span className="text-sm">Write this change to {path}? The file must still be the version shown. Coordinate with other editors: concurrent writes are not locked and may be overwritten.</span>
            <Button
              size="sm"
              disabled={running}
              onClick={() => {
                setConfirming(false);
                onApply();
              }}
            >
              Apply change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" disabled={running} onClick={() => setConfirming(true)}>
              Review and apply…
            </Button>
            <Button size="sm" variant="ghost" disabled={running} onClick={onReject}>
              Reject
            </Button>
          </div>
        ))}
    </div>
  );
}

function SpecDetail({ specId, threadId, onBack }: { specId: string; threadId: string | null; onBack: () => void }) {
  const rpc = useRpc<RpcContract>();
  const reviewer = useReviewer();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const load = useCallback(() => {
    rpc.call("spec_detail", { specId }).then(
      (result) => {
        setDetail(result);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, specId]);
  useEffect(load, [load]);
  useRealtime(CHANGED, (payload) => {
    if (payload && typeof payload === "object" && "specId" in payload && (payload.specId === specId || payload.specId === null)) load();
  });
  const act = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        setActionError(null);
        load();
      },
      (cause) => {
        setActionError(errorText(cause));
        load();
      },
    );

  const latest = detail?.runs[0] ?? null;
  const visibleFindings = useMemo(() => {
    if (!detail) return [];
    return detail.findings.filter((f) => (showResolved ? true : ["open", "fix_requested", "contested", "proposal_pending"].includes(f.state)));
  }, [detail, showResolved]);
  if (error) return <ErrorLine error={error} />;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { spec } = detail;
  const pendingProposals = detail.proposals.filter((p) => p.state === "proposed");
  const otherProposals = detail.proposals.filter((p) => p.state !== "proposed").slice(0, 5);
  const runningRuns = new Set(detail.runs.filter((run) => run.state === "running").map((run) => run.id));
  const counts = {
    fixed: detail.findings.filter((f) => f.state === "fixed").length,
    tradeoffs: detail.findings.filter((f) => f.state === "accepted_tradeoff").length,
    dismissed: detail.findings.filter((f) => f.state === "dismissed").length,
  };
  const waitingForElephant = detail.findings.some((f) => f.state === "fix_requested");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onBack}>
          ← All specs
        </button>
        <h2 className="text-lg font-semibold">{spec.title}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {spec.path} · {spec.currentHash ? `current version ${spec.currentHash.slice(0, 10)}` : "file missing"}
        </p>
        <ReviewerBanner status={reviewer} />
      </div>
      <ErrorLine error={actionError} />

      {pendingProposals.length > 0 && (
        <Section title="Waiting for your confirmation">
          {pendingProposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              running={p.runId !== null && runningRuns.has(p.runId)}
              path={spec.path}
              onApply={() => act(rpc.call("proposal_apply", { proposalId: p.id, baseHash: p.baseHash, opId: opId() }))}
              onReject={() => act(rpc.call("proposal_reject", { proposalId: p.id, reason: "" }))}
            />
          ))}
        </Section>
      )}

      <Section
        title="Findings"
        actions={
          <div className="flex items-center gap-2">
            {threadId && latest && latest.threadId === threadId && waitingForElephant && (
              <Button size="sm" variant="outline" onClick={() => act(rpc.call("elephant_request", { runId: latest.id, threadId }))}>
                Ask Elephant to resolve
              </Button>
            )}
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
              Show resolved
            </label>
          </div>
        }
      >
        <p className="text-xs text-muted-foreground">
          {counts.fixed} fixed · {counts.tradeoffs} accepted trade-off(s) · {counts.dismissed} dismissed
        </p>
        {visibleFindings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{showResolved ? "No findings yet." : "Nothing waits for a decision."}</p>
        ) : (
          <ul className="space-y-2">
            {visibleFindings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                running={runningRuns.has(f.runId)}
                onDecide={(kind, rationale) => act(rpc.call("finding_decide", { findingId: f.id, kind, rationale, opId: opId() }))}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Review">
        <StartReview spec={spec} threadId={threadId} reviewer={reviewer} />
        {detail.runs.slice(0, 5).map((run) => (
          <RunCard key={run.id} run={run} stages={detail.stages} onCancel={() => act(rpc.call("review_cancel", { runId: run.id }))} />
        ))}
      </Section>

      {otherProposals.length > 0 && (
        <Section title="Earlier proposals">
          {otherProposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} path={spec.path} running={p.runId !== null && runningRuns.has(p.runId)} onApply={() => {}} onReject={() => {}} />
          ))}
        </Section>
      )}

      <Section
        title="Document"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setShowDoc((v) => !v)}>
            {showDoc ? "Hide" : "Show"}
          </Button>
        }
      >
        {showDoc && (detail.content === null ? <p className="text-sm text-muted-foreground">The file is missing.</p> : <Markdown content={detail.content} />)}
      </Section>

      <Section title="History">
        <ul className="space-y-1 text-xs text-muted-foreground">
          {detail.events.slice(0, 30).map((e) => (
            <li key={e.id}>
              {time(e.at)} · {e.message}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// --- surfaces ----------------------------------------------------------------

function Workspace({ projectId, threadId }: { projectId: string; threadId: string | null }) {
  const [specId, setSpecId] = useState<string | null>(null);
  useEffect(() => setSpecId(null), [projectId]);
  return specId ? (
    <SpecDetail specId={specId} threadId={threadId} onBack={() => setSpecId(null)} />
  ) : (
    <SpecList projectId={projectId} onOpen={setSpecId} />
  );
}

function ProjectPage() {
  const rpc = useRpc<RpcContract>();
  const reviewer = useReviewer();
  const { projectId: contextProjectId } = useBbContext();
  const [projects, setProjects] = useState<{ id: string; name: string; root: string | null }[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    rpc.call("projects_list").then(
      (result) => {
        setProjects(result.projects);
        // Prefer the project the user is working in; otherwise the first one with a local checkout.
        const inContext = result.projects.find((p) => p.id === contextProjectId);
        const firstLocal = result.projects.find((p) => p.root !== null);
        setProjectId((current) => current ?? inContext?.id ?? firstLocal?.id ?? result.projects[0]?.id ?? null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, contextProjectId]);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Spec workspace</h1>
        <p className="text-sm text-muted-foreground">
          Markdown specs, Goldfish reviews and your decisions. Changes reach a spec only after you confirm the diff.
        </p>
        <ReviewerBanner status={reviewer} />
      </div>
      <ErrorLine error={error} />
      {projects && (
        <label className="flex items-center gap-2 text-sm">
          Project
          <select
            className="rounded-md border bg-transparent px-2 py-1"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.root === null ? " (no local checkout)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {projectId && <Workspace projectId={projectId} threadId={null} />}
    </div>
  );
}

function ThreadTab({ threadId }: { threadId: string }) {
  const rpc = useRpc<RpcContract>();
  const navigate = useBbNavigate();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [active, setActive] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("thread_overview", { threadId }).then(
      (result) => {
        setProjectId(result.projectId);
        setActive(result.activeRuns);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, threadId]);
  useEffect(load, [load]);
  useRealtime(CHANGED, load);
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {active.length > 0 ? `${active.length} review(s) in progress or waiting for you` : "No review in progress"}
        </p>
        <Button size="sm" variant="ghost" onClick={() => navigate.toPluginPanel("specs")}>
          Open full page
        </Button>
      </div>
      <ErrorLine error={error} />
      {projectId && <Workspace projectId={projectId} threadId={threadId} />}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "specs",
    title: "Spec workspace",
    icon: "FileText",
    path: "specs",
    component: ProjectPage,
  });
  app.slots.experimental_tab({
    id: "egm-thread",
    title: "Elephant Goldfish",
    icon: "FileText",
    context: { kind: "thread" },
    availability: "fixed",
    layout: "flush",
    component: ThreadTab,
  });
});
