// Goldfish prompt assembly from the pinned upstream personas and standards,
// and parsing of the reviewers' natural-language reports into findings.
// Upstream has no structured finding schema, so this adaptation asks for a
// fixed line format and keeps the raw report beside whatever it parsed.
import bootstrapOrchestrator from "../upstream/agents/bootstrap_orchestrator.md" with { type: "text" };
import codebaseDetails from "../upstream/agents/codebase_details.md" with { type: "text" };
import comprehension from "../upstream/agents/comprehension.md" with { type: "text" };
import designCritic from "../upstream/agents/design_critic.md" with { type: "text" };
import implementationReadiness from "../upstream/agents/implementation_readiness.md" with { type: "text" };
import structural from "../upstream/agents/structural.md" with { type: "text" };
import style from "../upstream/agents/style.md" with { type: "text" };
import zoomOut from "../upstream/agents/zoom_out.md" with { type: "text" };
import featureSpec from "../upstream/document_standards/feature-spec-standard.md" with { type: "text" };
import heilmeier from "../upstream/document_standards/heilmeier-standard.md" with { type: "text" };
import implementationStandard from "../upstream/document_standards/implementation-readiness-standard.md" with { type: "text" };
import reimplementation from "../upstream/document_standards/re-implementation-standard.md" with { type: "text" };
import zoomOutStandard from "../upstream/document_standards/zoom-out-standard.md" with { type: "text" };
import type { LensId, PresetId, Severity, StandardId } from "./contract.ts";

export const PERSONAS: Record<LensId, string> = {
  zoom_out: zoomOut,
  comprehension,
  design_critic: designCritic,
  implementation_readiness: implementationReadiness,
  structural,
  style,
  codebase_details: codebaseDetails,
};
// Kept for the bootstrap skill's reference; not a review lens.
export const BOOTSTRAP_ORCHESTRATOR = bootstrapOrchestrator;

export const STANDARDS: Record<StandardId, string> = {
  "feature-spec-standard": featureSpec,
  "implementation-readiness-standard": implementationStandard,
  "zoom-out-standard": zoomOutStandard,
  "heilmeier-standard": heilmeier,
  "re-implementation-standard": reimplementation,
};

/** One stage of a review pipeline: a lens judged against a standard. */
export type StagePlan = { lens: LensId; standard: StandardId };

/**
 * Upstream egm_review presets. `full`: stages 5–9 (zoom out, comprehension,
 * critic, intermediate zoom out, implementation readiness). `feature_spec`:
 * stages 5–8. `implementation`: stage 9 only. `brainstorm`: egm_brainstorm's
 * six lenses on a concepts brief, in BRAINSTORM mode.
 */
export function presetStages(preset: PresetId, lenses: LensId[] | undefined, standard: StandardId | undefined): StagePlan[] {
  switch (preset) {
    case "full":
      return [
        { lens: "zoom_out", standard: "zoom-out-standard" },
        { lens: "comprehension", standard: "re-implementation-standard" },
        { lens: "design_critic", standard: "feature-spec-standard" },
        { lens: "zoom_out", standard: "zoom-out-standard" },
        { lens: "implementation_readiness", standard: "implementation-readiness-standard" },
      ];
    case "feature_spec":
      return [
        { lens: "zoom_out", standard: "zoom-out-standard" },
        { lens: "comprehension", standard: "re-implementation-standard" },
        { lens: "design_critic", standard: "feature-spec-standard" },
        { lens: "zoom_out", standard: "zoom-out-standard" },
      ];
    case "brainstorm":
      return [
        { lens: "design_critic", standard: "heilmeier-standard" },
        { lens: "codebase_details", standard: "heilmeier-standard" },
        { lens: "zoom_out", standard: "zoom-out-standard" },
        { lens: "comprehension", standard: "heilmeier-standard" },
        { lens: "implementation_readiness", standard: "heilmeier-standard" },
        { lens: "structural", standard: "heilmeier-standard" },
      ];
    case "implementation":
      return [{ lens: "implementation_readiness", standard: "implementation-readiness-standard" }];
    case "custom": {
      const chosen = lenses && lenses.length > 0 ? lenses : (["design_critic", "structural"] as LensId[]);
      return chosen.map((lens) => ({ lens, standard: standard ?? "feature-spec-standard" }));
    }
  }
}

export type ContextFile = { path: string; content: string };

const FORMAT = `
## Output format for this review (adapted by the BB Elephant-Goldfish plugin)

You are running as a Goldfish: a fresh reviewer with no conversation history and no tools.
You cannot open files, run commands or search code. Everything you may use is in this message.
If a judgment needs a file or a search you do not have, say so as a finding instead of guessing.

Report each finding as one block in exactly this form, and nothing else before or between blocks:

### FINDING
severity: <blocker|major|nit>
lines: <start>-<end> | none
title: <one line>
<explanation and rationale, several lines allowed>

If you have no findings, answer exactly: NO FINDINGS
`;

export function stageMessages(args: {
  plan: StagePlan;
  /** Upstream personas branch on `Mode`: REVIEW audits a document, BRAINSTORM stress-tests a concept. */
  mode: "REVIEW" | "BRAINSTORM";
  specPath: string;
  specContent: string;
  context: ContextFile[];
  earlierReports: { lens: LensId; text: string }[];
}): { role: "system" | "user"; content: string }[] {
  const { plan, mode, specPath, specContent, context, earlierReports } = args;
  const system = [PERSONAS[plan.lens], "\n## Document standard\n", STANDARDS[plan.standard], FORMAT].join("\n");
  const numbered = specContent
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}| ${line}`)
    .join("\n");
  const parts = [`Mode: ${mode}\n`, `# Document under review: ${specPath}\n`, "```markdown", numbered, "```"];
  for (const file of context) {
    parts.push(`\n# Context file: ${file.path}\n`, "```", file.content, "```");
  }
  if (earlierReports.length > 0) {
    // Upstream's intermediate zoom out reviews the earlier stages' additions.
    parts.push("\n# Earlier stage reports in this round\n");
    for (const report of earlierReports) parts.push(`## ${report.lens}\n`, report.text);
  }
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n") },
  ];
}

export type ParsedFinding = {
  severity: Severity;
  rawSeverity: string;
  title: string;
  body: string;
  lineStart: number | null;
  lineEnd: number | null;
};

const severityOf = (raw: string): Severity => {
  const s = raw.toLowerCase();
  if (s.includes("blocker") || s.includes("🔴") || s.includes("critical")) return "blocker";
  if (s.includes("major") || s.includes("🟡") || s.includes("high")) return "major";
  if (s.includes("nit") || s.includes("🟢") || s.includes("minor") || s.includes("low")) return "nit";
  return "unknown";
};

/**
 * Parse a report in the requested block format. Returns `null` when the
 * report follows neither the format nor the explicit "NO FINDINGS" answer;
 * the caller then keeps the raw report as one unparsed finding so nothing
 * the reviewer said is lost.
 */
export function parseFindings(report: string): ParsedFinding[] | null {
  const trimmed = report.trim();
  if (/^NO FINDINGS\.?$/i.test(trimmed)) return [];
  const blocks = trimmed.split(/^###\s*FINDING\s*$/im).slice(1);
  if (blocks.length === 0) return null;
  const findings: ParsedFinding[] = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let rawSeverity = "";
    let title = "";
    let lineStart: number | null = null;
    let lineEnd: number | null = null;
    const body: string[] = [];
    for (const line of lines) {
      const field = /^(severity|lines|title):\s*(.*)$/i.exec(line.trim());
      if (field && body.length === 0) {
        const key = field[1]!.toLowerCase();
        const value = field[2]!.trim();
        if (key === "severity") rawSeverity = value;
        else if (key === "title") title = value;
        else {
          const range = /(\d+)\s*(?:-\s*(\d+))?/.exec(value);
          if (range) {
            lineStart = Number(range[1]);
            lineEnd = Number(range[2] ?? range[1]);
          }
        }
        continue;
      }
      body.push(line);
    }
    findings.push({
      severity: severityOf(rawSeverity),
      rawSeverity: rawSeverity || "(none)",
      title: title || body.find((l) => l.trim() !== "")?.trim().slice(0, 120) || "(untitled finding)",
      body: body.join("\n").trim(),
      lineStart,
      lineEnd,
    });
  }
  return findings;
}
