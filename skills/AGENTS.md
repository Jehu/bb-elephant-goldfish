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
- Preserve upstream Apache-2.0 attribution. Mark differences from upstream.
- Resolve runtime references relative to the registered skill directory, not
  the user's working directory or the repository's upstream tree.
- Reviewed specs change only through an `egm_propose` diff the human confirms.
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
