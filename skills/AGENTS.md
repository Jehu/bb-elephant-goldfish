# Adapted EGM skills

## Purpose

Seven agent skills adapting the pinned Elephant-Goldfish Model to BB.

## Ownership

- `egm-brainstorm/`, `egm-draft/`, `egm-review/`, `egm-review-loop/`,
  `egm-resolve/`, `egm-drift-report/`, `egm-bootstrap/`: registered skills,
  each with its Apache-2.0 license and any runtime references it needs.
- Unmodified upstream source materials remain under root `upstream/`.

## Local Contracts

- Frontmatter names match the seven names selected by `server.ts` configure().
- The shared review contract is provided directly by plugin agent instructions
  and Goldfish prompt assembly from `server/review-guidelines.md`. Do not copy
  it into skills or rely on personally installed skills. Keep adapted workflows
  consistent with its scope and preserve explicit human confirmation gates.
- Preserve upstream Apache-2.0 attribution. Mark differences from upstream.
- Resolve runtime references relative to the registered skill directory, not
  the user's working directory or the repository's upstream tree.
- Reviewed specs change only through an `egm_propose` diff the human confirms.
- Draft produces design documents and clearly labeled examples only. For production
  code requests, explain that scope and clarify the next step; do not silently
  substitute examples or start implementation within the design workflow.
- Brainstorm records actual alternatives and reasons alongside decisions in the
  brief; undocumented history is not evidence that no alternatives were discussed.
  Draft reads that context and rechecks the whole draft against its predecessor
  before finalization. Material contradictions and new architecture, interface or
  dependency decisions require a human decision; missing headings alone do not.
- Registration and `egm_specs` use the invoking thread's checkout. Read the
  returned checkout before accessing a document; never substitute the main
  checkout or another worktree for an existing spec ID. Reviews and confirmed
  proposals remain bound to the registered checkout.
- Drift is bounded analysis, not an AST equivalence guarantee.
- Bootstrap is documentation-only, respects ignores and symlinks, and asks
  before expanding beyond 15 discovered directories.

## Work Guidance

- State actual BB tool names and unavailable features plainly.
- Read the matching upstream skill before changing its adapted counterpart.

## Verification

- `bb plugin install . --yes` imports the skills into BB; busy sessions get
  them only at a safe session start.
- Live Elephant smoke exercised `egm_review_status` and `egm_propose` from a
  newly started BB thread.

## Child DOX Index

None.
