---
name: egm-review-loop
license: Apache-2.0
description: >-
  Run the EGM antagonistic review loop on a document through the Elephant
  Goldfish plugin: chosen reviewers on default BB workers or the optional
  tool-less Advanced endpoint, Elephant resolution, human-confirmed fixes, and
  automatic re-review until clean or the round limit. Use for iterative review
  of design docs, READMEs, specs or plans.
---

# EGM Review Loop (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`). The plugin is the loop driver; you are the Elephant resolver.

## Inputs (ask only for what is missing, one question at a time)

- **TargetFile**: project-relative Markdown path. Register it with `egm_register_spec`.
- **Reviewers**: lens names from `zoom_out`, `comprehension`, `design_critic`, `implementation_readiness`, `structural`, `style`, `codebase_details`. Upstream recommendations: feature specs → `design_critic` + `structural` against `feature-spec-standard`; implementation plans → `implementation_readiness` + `codebase_details` against `implementation-readiness-standard`.
- **Standard**: one of `feature-spec-standard`, `implementation-readiness-standard`, `zoom-out-standard`, `heilmeier-standard`, `re-implementation-standard`.
- **Reviewer context**: project-relative files supplied to Advanced endpoint calls; BB workers follow BB permission mode.
- **Round limit**: default 3.

## Loop

1. `egm_start_review` with `preset: "custom"`, `lenses`, `standard`, `context`, `maxRounds`. The selected engine runs the reviewers in parallel. Default BB workers need prior human consent in the Elephant Goldfish tab; Advanced endpoint calls are tool-less and never use BB worker consent.
2. When findings arrive, run **egm-resolve**: contest with rationale or propose fixes. The human decides each finding in the Elephant Goldfish tab.
3. When the human confirms your proposal and every finding of the round is resolved, the plugin starts the next round itself only if the document still matches the applied version. If it changed independently, the run goes stale; start a fresh review instead.
4. The loop ends when a round reports no findings, when every finding is decided without a change, or at the round limit. At the limit the changed document was **not** re-reviewed; tell the human.

`SemanticTarget` (reviewing a section only) is not supported by this adaptation: reviewers always see the whole file with line numbers. Tell the human if they ask for a section, and say which lines matter in the context instead.
