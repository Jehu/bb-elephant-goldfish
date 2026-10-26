---
name: egm-review
license: Apache-2.0
description: >-
  Run the EGM Goldfish review of a Markdown design document or spec through the
  Elephant Goldfish plugin: fresh-context, tool-less reviewers in stages
  (zoom out, comprehension, design critic, intermediate zoom out,
  implementation readiness). Use when the user asks to review a design doc,
  feature spec or implementation plan.
---

# EGM Review (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`). Read `references/execution-constraints.md` relative to this skill directory; the workflow below replaces upstream delegation and remediation instructions.

You are the **Elephant**: you hold the conversation and project context. The **Goldfish** reviewers are not you and not BB threads. The plugin runs each one as a single, tool-less model call with only the persona, the document standard, the numbered document and the context files the human chose. You never write a Goldfish report yourself, and you never present your own critique as a Goldfish review.

## Steps

1. **Target.** Ask for the spec path if it is not given (plain chat, one question). Register it with `egm_register_spec` (project-relative path). `egm_specs` lists what is registered.
2. **Context.** Ask once whether the reviewers should get context files (source files or docs). Reviewers cannot open files themselves: only what is listed is sent. Files linked from the spec are not fetched automatically; list them if they matter.
3. **Preset.** Ask the human to choose one (single question):
   - `full`: stages 5–9.
   - `feature_spec`: stages 5–8.
   - `implementation`: stage 9 only.
   - `custom`: chosen lenses (`design_critic`, `structural`, `style`, `codebase_details`, …) against one standard.
4. **Start.** Call `egm_start_review` with `specId`, `preset`, `context`, and `maxRounds` (default 3). If it answers that Goldfish review is unavailable, tell the human exactly why and stop. Do not substitute your own review.
5. **Report, don't dump.** Tell the human the review runs in the **Elephant Goldfish** tab beside this thread, where stages, findings and reports show live. Reports are written under `.egm/reviews/`.
6. **Resolve.** When `egm_review_status` shows findings, follow the **egm-resolve** skill.

## Differences from upstream

- Stages run without per-stage pause gates: findings may be decided while stages are running. After stages finish, the run waits in `awaiting_decisions` if any finding remains unresolved.
- Fixes are never written by you. You propose a full revised document with `egm_propose`; the human confirms the diff in the tab; only then is the file changed.
- After a confirmed change is applied and no finding is left unresolved, the plugin starts the next round on the applied version, up to `maxRounds`. If the file changed independently, the run goes stale and the human must start a fresh review.
- A run that failed, was cancelled, hit a limit or went stale is not a successful review. Say so plainly.
