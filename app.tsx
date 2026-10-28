// Elephant Goldfish — BB plugin frontend.
//
// Two surfaces share one spec view:
// - "Spec workspace" page in the sidebar: pick a project, see every spec.
// - "Elephant Goldfish" tab beside a thread: draft requests for that thread.
// Decisions and applying a proposal happen only here, by the human.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Markdown,
  definePluginApp,
  experimental_Diff as Diff,
  experimental_usePluginId,
  useBbNavigate,
  useRealtime,
  useBbContext,
  useComposer,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { makePrompt, writePrompt } from "./composer";
import { egmLink, parseTargetPath, targetPath, targetSchema, type EgmTarget } from "./lib/egm-links";

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

const FINDING_TONE: Record<FindingState, string> = {
  open: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  fix_requested: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  contested: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  proposal_pending: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  fixed: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  accepted_tradeoff: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  dismissed: "bg-muted text-muted-foreground",
  superseded: "bg-muted text-muted-foreground",
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

type MarkVariant = "split" | "elephant" | "goldfish";

/** Exact role-mark geometry from upstream Mark.astro at the repository pin. */
function Mark({ variant = "split", label, className }: { variant?: MarkVariant; label?: string; className?: string }) {
  const labelled = Boolean(label);
  const viewBox = variant === "elephant" ? "1.6 6.8 10.4 10.4" : variant === "goldfish" ? "12.5 6.8 10.4 10.4" : "1.5 1.5 21 21";
  return (
    <svg viewBox={viewBox} className={cn("size-5 shrink-0", className)} role={labelled ? "img" : undefined} aria-label={label} aria-hidden={labelled ? undefined : true}>
      {(variant === "split" || variant === "elephant") && <g>
        <path d="M10.30,6.80 A5.20,5.20 0 0 0 10.30,17.20 A1.20,1.20 0 0 0 11.50,16.00 L11.50,8.00 A1.20,1.20 0 0 0 10.30,6.80Z" fill="var(--egm-color-elephant)" />
        <path d="M7.20,12.00 C6.80,14.60 3.40,14.70 3.20,12.60 C3.10,11.20 3.30,10.20 3.60,9.40" fill="none" stroke="var(--egm-color-elephant)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>}
      {(variant === "split" || variant === "goldfish") && <g>
        <path d="M13.70,6.80 A5.20,5.20 0 0 1 13.70,17.20 A1.20,1.20 0 0 1 12.50,16.00 L12.50,8.00 A1.20,1.20 0 0 1 13.70,6.80Z" fill="var(--egm-color-goldfish)" />
        <path d="M16.80,12.00 L18.00,12.00 C18.80,12.00 19.40,10.60 20.90,9.40 M18.00,12.00 C18.80,12.00 19.40,13.40 20.90,14.60" fill="none" stroke="var(--egm-color-goldfish)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>}
    </svg>
  );
}

function HostMark({ className }: { className?: string }) {
  return (
    <svg viewBox="1.5 1.5 21 21" className={className} fill="none" aria-hidden="true">
      <path d="M10.30,6.80 A5.20,5.20 0 0 0 10.30,17.20 A1.20,1.20 0 0 0 11.50,16.00 L11.50,8.00 A1.20,1.20 0 0 0 10.30,6.80Z" fill="currentColor" />
      <path d="M7.20,12.00 C6.80,14.60 3.40,14.70 3.20,12.60 C3.10,11.20 3.30,10.20 3.60,9.40" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.70,6.80 A5.20,5.20 0 0 1 13.70,17.20 A1.20,1.20 0 0 1 12.50,16.00 L12.50,8.00 A1.20,1.20 0 0 1 13.70,6.80Z" fill="currentColor" />
      <path d="M16.80,12.00 L18.00,12.00 C18.80,12.00 19.40,10.60 20.90,9.40 M18.00,12.00 C18.80,12.00 19.40,13.40 20.90,14.60" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

function Section({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
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
      setStatus({ engine: "goldfish", ready: false, reason: errorText(cause), model: null, endpoint: null }),
    );
  }, [rpc]);
  return status;
}

function ReviewerBanner({ status }: { status: ReviewerStatus | null }) {
  if (status === null) return null;
  const engine = status.engine === "bb" ? "BB" : "Goldfish";
  if (status.ready) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Mark variant="goldfish" className="size-3.5" />
        {engine}: <span className="font-mono">{status.model ?? "default model"}</span> — {status.engine === "bb" ? "ready; fresh BB worker per stage; can run tools, subject only to BB's permissions." : "ready; fresh context, no tools, read-only."}
      </p>
    );
  }
  return (
    <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-700 dark:text-amber-400">
      {engine} review is unavailable: {status.reason ?? "not ready"}
    </p>
  );
}
type DraftRequest = (instruction: string, data: Record<string, unknown>) => void;

function GuidedRequest({ threadId, onDraft }: { threadId: string; onDraft: DraftRequest }) {
  const rpc = useRpc<RpcContract>();
  const [action, setAction] = useState<"brainstorm" | "draft" | "work" | null>(null);
  const [goal, setGoal] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<{ paths: string[]; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!action) return;
    if (!query.trim()) {
      setSearching(false);
      setResults(null);
      setError(null);
      return;
    }
    let current = true;
    setSearching(true);
    setResults(null);
    setError(null);
    const timer = setTimeout(() => {
      rpc.call("workspace_search", { threadId, query: query.trim() }).then(
        (result) => { if (current) setResults(result); },
        (cause) => { if (current) setError(errorText(cause)); },
      ).finally(() => { if (current) setSearching(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [action, query, retry, rpc, threadId]);
  const instructions = {
    brainstorm: "Use the Elephant brainstorming workflow to explore the goal and relevant selected files. Do not start work without the user's direction.",
    draft: "Use the Elephant drafting workflow to draft a spec from the goal and selected brief or notes.",
    work: "Use the Elephant workflow to work on the selected existing document and the stated goal. Propose changes for human review rather than directly editing the document.",
  };
  return (
    <Section title={<span className="flex items-center gap-1.5"><Mark variant="elephant" className="size-4" />Start with Elephant</span>}>
      <p className="text-xs text-muted-foreground">Prepare a request in this thread's composer. You review and send it yourself.</p>
      <div className="flex flex-wrap gap-2">
        {([['brainstorm', 'Brainstorm an idea'], ['draft', 'Draft a spec'], ['work', 'Work on a document']] as const).map(([id, label]) => (
          <Button key={id} size="sm" variant={action === id ? "default" : "outline"} onClick={() => setAction(id)}>{label}</Button>
        ))}
      </div>
      {action && <div className="space-y-2">
        <label className="block space-y-1 text-xs font-medium">Goal
          <Input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="What would you like to accomplish?" />
        </label>
        <label className="block space-y-1 text-xs font-medium">Find workspace files
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" />
        </label>
        {!query.trim() && <p className="text-xs text-muted-foreground">Type a filename or path to search the workspace.</p>}
        {selected.length > 0 && <div className="space-y-1 text-xs"><p className="font-medium">Selected files</p>{selected.map((path) => <div key={path} className="flex items-center gap-2"><span className="break-all">{path}</span><button type="button" className="underline" onClick={() => setSelected((items) => items.filter((item) => item !== path))}>Remove</button></div>)}</div>}
        {searching && <p className="text-xs text-muted-foreground">Searching workspace…</p>}
        {error && <div><ErrorLine error={error} /><Button size="sm" variant="ghost" onClick={() => setRetry((value) => value + 1)}>Retry search</Button></div>}
        {results && <div className="space-y-1 text-xs">
          {results.paths.length === 0 && <p className="text-muted-foreground">No matching files. Try another search.</p>}
          {results.paths.map((path) => <label key={path} className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(path)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, path] : items.filter((item) => item !== path))} /><span className="break-all">{path}</span></label>)}
          {results.truncated && <p className="text-muted-foreground">Results truncated. Narrow your search to see more files.</p>}
        </div>}
        <Button size="sm" disabled={!goal.trim() || (action === "work" && selected.length === 0)} onClick={() => onDraft(instructions[action], { goal: goal.trim(), files: selected })}>Draft in composer</Button>
      </div>}
    </Section>
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
        <div className="flex items-start gap-3 rounded-md bg-muted/35 p-3">
          <Mark variant="goldfish" className="mt-0.5 size-5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No specs yet</p>
            <p className="text-sm text-muted-foreground">Add the Markdown file you want Goldfish to review using the existing field below.</p>
          </div>
        </div>
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
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = !reviewer?.ready || !spec.exists || busy || (preset === "custom" && lenses.length === 0);
  const engineLabel = reviewer?.engine === "bb" ? "BB worker" : "Advanced endpoint";
  const start = () => rpc.call("review_start", { specId: spec.id, projectId: spec.projectId, preset, ...(preset === "custom" ? { lenses, standard } : {}), context: context.split(",").map((s) => s.trim()).filter(Boolean), maxRounds, threadId });
  const requestStart = async () => {
    setBusy(true);
    setError(null);
    try {
      if (reviewer?.engine !== "bb") await start();
      else {
        const consent = await rpc.call("consent_status", null);
        if (consent.granted) await start();
        else setWarning(consent.warning);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const grantConsentAndStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const consent = await rpc.call("consent_grant", null);
      if (!consent.granted) throw new Error(consent.warning);
      setWarning(null);
      await start();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-md bg-muted/35 p-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" title={p.hint} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} className={cn("rounded-md border px-2 py-1 text-xs", preset === p.id ? "border-foreground bg-foreground text-background" : "hover:bg-state-hover")}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{PRESETS.find((p) => p.id === preset)?.hint}</p>
      {preset === "custom" && <div className="space-y-2">
        <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
          <legend className="text-xs font-medium">Reviewers</legend>
          {(Object.keys(LENS_LABEL) as LensId[]).map((lens) => <label key={lens} className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={lenses.includes(lens)} onChange={(e) => setLenses((current) => e.target.checked ? [...current, lens] : current.filter((item) => item !== lens))} />
            {LENS_LABEL[lens]}
          </label>)}
        </fieldset>
        {lenses.length === 0 && <p className="text-xs text-muted-foreground">Select at least one reviewer.</p>}
        <label className="flex items-center gap-2 text-xs">Standard
          <select className="rounded-md border bg-transparent px-2 py-1" value={standard} onChange={(e) => setStandard(e.target.value as StandardId)}>
            {(Object.keys(STANDARD_LABEL) as StandardId[]).map((id) => <option key={id} value={id}>{STANDARD_LABEL[id]}</option>)}
          </select>
        </label>
      </div>}
      <Input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Context files for the reviewers, comma-separated (optional)" aria-label="Context files" />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Rounds at most
          <Input type="number" min={1} max={10} value={maxRounds} onChange={(e) => setMaxRounds(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="h-8 w-16" />
        </label>
        <Button size="sm" disabled={disabled} onClick={requestStart}>Start {engineLabel} review</Button>
      </div>
      {reviewer?.engine === "bb" && (
        <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => rpc.call("consent_revoke", null).catch((cause: unknown) => setError(errorText(cause)))}>
          Revoke BB worker consent
        </button>
      )}
      <ErrorLine error={error} />
      <Dialog open={warning !== null} onOpenChange={(open) => { if (!open && !busy) setWarning(null); }}>
        <DialogContent hideCloseButton={busy}>
          <DialogHeader><DialogTitle>Allow BB worker review?</DialogTitle><DialogDescription>{warning}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setWarning(null)}>Cancel</Button><Button disabled={busy} onClick={grantConsentAndStart}>Allow BB workers and start review</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function RunCard({ run, stages, onCancel }: { run: Run; stages: Stage[]; onCancel: () => void }) {
  const mine = stages.filter((s) => s.runId === run.id);
  return (
    <div className="space-y-2 border-l-2 border-l-border pl-3">
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
      <p className="text-xs text-muted-foreground">
        Reviewer: {run.engine}{run.provider ? ` · ${run.provider}` : ""}{run.model ? ` · ${run.model}` : ""}{run.threadId ? ` · thread ${run.threadId}` : ""}
      </p>
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
            <span className="text-muted-foreground"> · {stage.engine}{stage.provider ? ` · ${stage.provider}` : ""}{stage.model ? ` · ${stage.model}` : ""}{stage.workerThreadId ? ` · thread ${stage.workerThreadId}` : ""}</span>
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

function FindingCard({ finding, running, onDecide, reveal }: { finding: Finding; running: boolean; onDecide: (kind: DecisionKind, rationale: string) => void; reveal?: boolean }) {
  const [open, setOpen] = useState(reveal || finding.state === "open" || finding.state === "contested");
  const decidable = ["open", "fix_requested", "contested"].includes(finding.state);
  const resolved = ["fixed", "accepted_tradeoff", "dismissed", "superseded"].includes(finding.state);
  return (
    <article className={cn("space-y-3 rounded-lg border p-3 transition-colors", resolved ? "border-border/70 bg-muted/25" : "border-border bg-card shadow-sm")}>
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Badge className={SEVERITY_TONE[finding.severity]}>{finding.rawSeverity === "(none)" ? finding.severity : finding.rawSeverity}</Badge>
        <span className="min-w-0 flex-1 text-sm font-semibold leading-5">{finding.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "Hide" : "Details"}</span>
      </button>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge className={FINDING_TONE[finding.state]}>{FINDING_LABEL[finding.state]}</Badge>
        <span>{LENS_LABEL[finding.lens]} · round {finding.round}{finding.lineStart !== null ? ` · lines ${finding.lineStart}–${finding.lineEnd} of the reviewed version` : ""}</span>
      </div>
      {open && (
        <>
          <div className="border-t pt-3 text-sm leading-6">
            <Markdown content={finding.body || "_No explanation given._"} />
          </div>
          {finding.elephantNote && (
            <div className="rounded-md bg-[color:var(--egm-color-elephant-surface)] px-2 py-1 text-sm">
              <div className="flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-400"><Mark variant="elephant" className="size-3" />Elephant contests this</div>
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
    </article>
  );
}

function ProposalCard({ proposal, path, running, onApply, onReject, onReviewDiff, onRevise, revealDiff }: { proposal: Proposal; path: string; running: boolean; onApply: () => void; onReject: () => void; onReviewDiff?: () => void; onRevise?: (feedback: string) => void; revealDiff?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const pending = proposal.state === "proposed";
  return (
    <div className="space-y-2 border-l-2 border-l-amber-500/50 pl-3">
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
      {onReviewDiff && proposal.diff && <Button size="sm" variant="outline" onClick={onReviewDiff}>Draft diff review request</Button>}
      {onRevise && <div className="flex flex-wrap gap-2"><Input aria-label="Revision feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="What should change?" /><Button size="sm" variant="outline" disabled={!feedback.trim()} onClick={() => onRevise(feedback.trim())}>Draft revision request</Button></div>}
      {proposal.stateReason && <p className="text-xs text-muted-foreground">{proposal.stateReason}</p>}
      {proposal.backupPath && (
        <p className="text-xs text-muted-foreground">
          Previous version kept at <span className="font-mono">{proposal.backupPath}</span>
        </p>
      )}
      {(pending || proposal.state === "stale" || revealDiff) && proposal.diff && <Diff patch={proposal.diff} path={path} />}
      {pending && running && <p className="text-xs text-muted-foreground">Wait for this review to finish before applying or rejecting this change.</p>}
      {pending &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 p-2">
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

function TargetItem({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "start" });
      ref.current?.focus({ preventScroll: true });
    }
  }, [active]);
  return <div ref={ref} tabIndex={active ? -1 : undefined} className={active ? "scroll-mt-4 rounded-md ring-2 ring-ring p-2" : undefined}>{children}</div>;
}

function SpecDetail({ specId, threadId, onBack, onDraft, target }: { specId: string; threadId: string | null; onBack: () => void; onDraft?: DraftRequest; target?: EgmTarget }) {
  const rpc = useRpc<RpcContract>();
  const reviewer = useReviewer();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(Boolean(target && !target.findingId && !target.proposalId));
  const [showResolved, setShowResolved] = useState(false);
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
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

  const visibleFindings = useMemo(() => {
    if (!detail) return [];
    return detail.findings.filter((f) => (showResolved || f.id === target?.findingId || ["open", "fix_requested", "contested", "proposal_pending"].includes(f.state)));
  }, [detail, showResolved, target?.findingId]);
  if (error) return <ErrorLine error={error} />;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { spec } = detail;
  if (target && spec.projectId !== target.projectId) return <ErrorLine error="This document does not belong to the linked project." />;
  const targetMissing = target?.findingId ? !detail.findings.some((f) => f.id === target.findingId)
    : target?.proposalId ? !detail.proposals.some((p) => p.id === target.proposalId) : false;
  const pendingProposals = detail.proposals.filter((p) => p.state === "proposed");
  const otherProposals = detail.proposals.filter((p) => p.state !== "proposed").filter((p, index) => index < 5 || p.id === target?.proposalId);
  const runningRuns = new Set(detail.runs.filter((run) => run.state === "running").map((run) => run.id));
  const counts = {
    fixed: detail.findings.filter((f) => f.state === "fixed").length,
    tradeoffs: detail.findings.filter((f) => f.state === "accepted_tradeoff").length,
    dismissed: detail.findings.filter((f) => f.state === "dismissed").length,
  };
  const eligibleFindings = detail.findings.filter((finding) => ["open", "fix_requested", "contested"].includes(finding.state) && detail.runs.some((run) => run.id === finding.runId && run.threadId === threadId && run.state !== "running"));
  const selectedRunId = eligibleFindings.find((finding) => selectedFindings.includes(finding.id))?.runId;
  const chosenFindings = eligibleFindings.filter((finding) => finding.runId === selectedRunId && selectedFindings.includes(finding.id));
  const specContext = { specId: spec.id, path: spec.path, title: spec.title, currentHash: spec.currentHash };
  const proposalContext = (proposal: Proposal) => ({ ...specContext, proposalId: proposal.id, runId: proposal.runId, findingIds: proposal.findingIds, state: proposal.state, summary: proposal.summary, baseHash: proposal.baseHash, diff: proposal.diff });
  const proposalInThread = (proposal: Proposal) => proposal.runId ? detail.runs.some((run) => run.id === proposal.runId && run.threadId === threadId) : threadId !== null && proposal.author === threadId;

  return (
    <div className="space-y-6" style={{ "--egm-color-elephant": "#6d63a8", "--egm-color-elephant-ink": "#514889", "--egm-color-elephant-surface": "#6d63a81a", "--egm-color-goldfish": "#c96d2d" } as CSSProperties}>
      <div className="space-y-1.5">
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onBack}>
          ← All specs
        </button>
        <div className="flex items-center gap-2">
          <Mark label="Elephant Goldfish" className="size-6" />
          <h2 className="text-lg font-semibold tracking-tight">{spec.title}</h2>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {spec.path} · {spec.currentHash ? `current version ${spec.currentHash.slice(0, 10)}` : "file missing"}
        </p>
        <ReviewerBanner status={reviewer} />
      </div>
      <ErrorLine error={actionError} />
      {targetMissing && <ErrorLine error="The linked item is no longer available. You are viewing its document." />}
      {onDraft && spec.exists && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onDraft("Use the Elephant drafting workflow to draft a spec from this concept document.", specContext)}>Draft from concept</Button><Button size="sm" variant="outline" onClick={() => onDraft("Propose a change to this document for human review; do not directly edit it.", specContext)}>Ask for change proposal</Button></div>}
      {!threadId && <p className="text-xs text-muted-foreground">To draft an Elephant request, open this spec in the relevant thread's Elephant Goldfish tab.</p>}

      {pendingProposals.length > 0 && (
        <Section title="Waiting for your confirmation">
          {pendingProposals.map((p) => (
            <TargetItem key={p.id} active={p.id === target?.proposalId}><ProposalCard
              proposal={p}
              running={p.runId !== null && runningRuns.has(p.runId)}
              path={spec.path}
              onApply={() => act(rpc.call("proposal_apply", { proposalId: p.id, baseHash: p.baseHash, opId: opId() }).then((result) => { if (onDraft && proposalInThread(p)) onDraft("The human just applied this proposed change to the document. Acknowledge that, then check the review status and continue the work from the applied state; do not edit the document directly.", { ...proposalContext(p), state: "applied" }); return result; }))}
              onReject={() => act(rpc.call("proposal_reject", { proposalId: p.id, reason: "" }))}
              onReviewDiff={onDraft && p.diff && proposalInThread(p) ? () => onDraft("Review the proposed diff and explain its implications; do not apply it.", proposalContext(p)) : undefined}
            /></TargetItem>
          ))}
        </Section>
      )}

      <Section
        title="Findings"
        actions={
          <div className="flex items-center gap-2">
            {onDraft && chosenFindings.length > 0 && <Button size="sm" variant="outline" onClick={() => onDraft("Refresh the review status first. Resolve only the selected finding IDs from this review run: contest any that are incorrect with a specific rationale, or propose fixes for those you agree with using only selected IDs. Do not act on unselected findings or directly edit the document; proposals require human review.", { ...specContext, runId: selectedRunId, findingIds: chosenFindings.map((finding) => finding.id), findings: chosenFindings.map((finding) => ({ id: finding.id, runId: finding.runId, state: finding.state, title: finding.title, body: finding.body })) })}>Ask Elephant to resolve selected</Button>}
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
        {onDraft && <p className="text-xs text-muted-foreground">Select up to 100 findings from one review run at a time.</p>}
        {visibleFindings.length === 0 ? (
          <div className="flex items-start gap-3 rounded-md bg-muted/35 p-3">
            <Mark variant="goldfish" className="mt-0.5 size-5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{showResolved ? "No findings yet" : "Nothing waits for a decision"}</p>
              <p className="text-sm text-muted-foreground">{showResolved ? "Start a Goldfish review to see its findings here." : "Review open findings above, or start the existing Goldfish review when you are ready."}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleFindings.map((f) => (
              <TargetItem key={f.id} active={f.id === target?.findingId}><div className="space-y-1">
              {onDraft && eligibleFindings.some((finding) => finding.id === f.id) && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={chosenFindings.some((finding) => finding.id === f.id)} disabled={(selectedRunId !== undefined && selectedRunId !== f.runId) || (chosenFindings.length >= 100 && !chosenFindings.some((finding) => finding.id === f.id))} onChange={(event) => setSelectedFindings(event.target.checked ? [...chosenFindings.map((finding) => finding.id), f.id] : chosenFindings.filter((finding) => finding.id !== f.id).map((finding) => finding.id))} />Select finding {f.id}</label>}
              <FindingCard
                key={f.id}
                finding={f}
                reveal={f.id === target?.findingId}
                running={runningRuns.has(f.runId)}
                onDecide={(kind, rationale) => act(rpc.call("finding_decide", { findingId: f.id, kind, rationale, opId: opId() }))}
              />
              </div></TargetItem>
            ))}
          </div>
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
            <TargetItem key={p.id} active={p.id === target?.proposalId}><ProposalCard revealDiff={p.id === target?.proposalId} proposal={p} path={spec.path} running={p.runId !== null && runningRuns.has(p.runId)} onApply={() => {}} onReject={() => {}} onReviewDiff={onDraft && p.diff && proposalInThread(p) ? () => onDraft("Review the proposed diff and explain its implications; do not apply it.", proposalContext(p)) : undefined} onRevise={onDraft && p.state === "rejected" && proposalInThread(p) ? (feedback) => onDraft("Revise the rejected proposal using the feedback and propose the revision for human review; do not directly edit the document.", { ...proposalContext(p), feedback }) : undefined} /></TargetItem>
          ))}
        </Section>
      )}

      <TargetItem active={Boolean(target && !target.findingId && !target.proposalId)}><Section
        title="Document"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setShowDoc((v) => !v)}>
            {showDoc ? "Hide" : "Show"}
          </Button>
        }
      >
        {showDoc && (detail.content === null ? <p className="text-sm text-muted-foreground">The file is missing.</p> : <Markdown content={detail.content} />)}
      </Section></TargetItem>

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

function Workspace({ projectId, threadId, onDraft, target }: { projectId: string; threadId: string | null; onDraft?: DraftRequest; target?: EgmTarget }) {
  const [specId, setSpecId] = useState<string | null>(target?.specId ?? null);
  useEffect(() => setSpecId(target?.specId ?? null), [projectId, target?.specId, target?.findingId, target?.proposalId]);
  if (target && target.projectId !== projectId) return <ErrorLine error="This link belongs to another project. Open it from the matching project thread or use the full-page link." />;
  return specId ? (
    <SpecDetail key={`${specId}:${target?.findingId ?? target?.proposalId ?? ""}`} specId={specId} threadId={threadId} onBack={() => setSpecId(null)} onDraft={onDraft} target={specId === target?.specId ? target : undefined} />
  ) : (
    <SpecList projectId={projectId} onOpen={setSpecId} />
  );
}

function ProjectPage({ subPath }: { subPath: string }) {
  const navigate = useBbNavigate();
  if (!subPath) return <ProjectOverview />;
  const target = parseTargetPath(subPath);
  return <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-4xl">
    {target ? <SpecDetail key={subPath} specId={target.specId} target={target} threadId={null} onBack={() => navigate.toPluginPanel("specs")} /> : <ErrorLine error="This Elephant Goldfish link is invalid." />}
  </div></div>;
}

function ProjectOverview() {
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
    <div className="mx-auto max-w-4xl space-y-5 p-6" style={{ "--egm-color-elephant": "#6d63a8", "--egm-color-elephant-ink": "#514889", "--egm-color-elephant-surface": "#6d63a81a", "--egm-color-goldfish": "#c96d2d" } as CSSProperties}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Mark label="Elephant Goldfish" className="size-7" />
          <h1 className="text-xl font-semibold tracking-tight">Spec workspace</h1>
        </div>
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

function ThreadTab({ threadId, target }: { threadId: string; target?: EgmTarget }) {
  const rpc = useRpc<RpcContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();
  const currentThread = useRef<string | null>(threadId);
  currentThread.current = threadId;
  useEffect(() => { currentThread.current = threadId; return () => { currentThread.current = null; }; }, [threadId]);
  const [pending, setPending] = useState<{ threadId: string; prompt: string } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  useEffect(() => { setPending(null); setDraftError(null); setDraftMessage(null); setProjectId(null); }, [threadId]);
  const commitDraft = (target: string, prompt: string, append: boolean) => {
    try {
      const result = writePrompt(composer, target, prompt, append, () => currentThread.current === target);
      if (result === "confirm") setPending({ threadId: target, prompt });
      else { setPending(null); setDraftMessage("Request added to the composer. Review it and send when ready."); }
      setDraftError(null);
    } catch (cause) {
      if (currentThread.current === target) setDraftError(`${errorText(cause)} Open the matching thread composer and try again.`);
    }
  };
  const draft: DraftRequest = (instruction, data) => {
    setDraftMessage(null);
    commitDraft(threadId, makePrompt(instruction, data), false);
  };
  const [projectId, setProjectId] = useState<string | null>(null);
  const [active, setActive] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("thread_overview", { threadId }).then(
      (result) => {
        if (currentThread.current !== threadId) return;
        setProjectId(result.projectId);
        setActive(result.activeRuns);
        setError(null);
      },
      (cause) => { if (currentThread.current === threadId) setError(errorText(cause)); },
    );
  }, [rpc, threadId]);
  useEffect(load, [load]);
  useRealtime(CHANGED, load);
  return (
    <div className="h-full min-h-0 space-y-5 overflow-y-auto p-4" style={{ "--egm-color-elephant": "#6d63a8", "--egm-color-elephant-ink": "#514889", "--egm-color-elephant-surface": "#6d63a81a", "--egm-color-goldfish": "#c96d2d" } as CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Mark label="Elephant Goldfish" className="size-5" />
          <p className="truncate text-xs text-muted-foreground">
            {active.length > 0 ? `${active.length} review(s) in progress or waiting for you` : "No review in progress"}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate.toPluginPanel("specs", target ? { subPath: targetPath(target) } : undefined)}>
          Open full page
        </Button>
      </div>
      <ErrorLine error={error} />
      <ErrorLine error={draftError} />
      {draftMessage && <p role="status" className="text-xs text-muted-foreground">{draftMessage}</p>}
      {pending && pending.threadId === threadId && <div className="space-y-2 rounded-md bg-muted/50 p-3"><p className="text-sm">The composer already has a draft. Append this request to its latest contents, or cancel without changing it?</p><div className="flex gap-2"><Button size="sm" onClick={() => commitDraft(pending.threadId, pending.prompt, true)}>Append</Button><Button size="sm" variant="ghost" onClick={() => { setPending(null); setDraftError(null); }}>Cancel</Button></div></div>}
      {!target && <GuidedRequest key={threadId} threadId={threadId} onDraft={draft} />}
      {projectId && <Workspace key={`workspace:${threadId}`} projectId={projectId} threadId={threadId} onDraft={draft} target={target} />}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.messageDirective({
    id: "egm-open",
    component: ({ attributes, source, message }) => {
      const navigate = useBbNavigate();
      const { threadId } = useBbContext();
      const pluginId = experimental_usePluginId();
      const parsed = targetSchema.safeParse(attributes);
      if (!parsed.success || parsed.data.projectId !== message.projectId) return <span>{source}</span>;
      const target = parsed.data;
      return <a className="font-medium underline underline-offset-4" href={egmLink(pluginId, target).url} onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (threadId === message.threadId && navigate.openThreadPanel({ actionId: "egm-detail", params: target })) event.preventDefault();
      }}>{target.proposalId ? "Review proposed change →" : target.findingId ? "View finding →" : "Open document →"}</a>;
    },
  });
  app.slots.experimental_tab({
    id: "egm-detail",
    title: "Elephant Goldfish · linked item",
    icon: "elephant-goldfish",
    context: { kind: "thread" },
    availability: "action",
    layout: "flush",
    component: ({ threadId, params }) => {
      const target = useMemo(() => targetSchema.safeParse(params), [params]);
      return target.success ? <ThreadTab threadId={threadId} target={target.data} /> : <ErrorLine error="Open a document, finding or proposal link from an Elephant Goldfish response." />;
    },
  });
  app.experimental_icons.register({ name: "elephant-goldfish", component: HostMark });
  app.slots.navPanel({
    id: "specs",
    title: "Spec workspace",
    icon: "elephant-goldfish",
    path: "specs",
    component: ProjectPage,
  });
  app.slots.experimental_tab({
    id: "egm-thread",
    title: "Elephant Goldfish",
    icon: "elephant-goldfish",
    context: { kind: "thread" },
    availability: "fixed",
    layout: "flush",
    component: ThreadTab,
  });
});
