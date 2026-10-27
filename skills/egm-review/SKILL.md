---
name: egm-review
license: Apache-2.0
description: >-
  Run the EGM review of a Markdown design document or spec through the Elephant
  Goldfish plugin: default BB workers or the optional tool-less Advanced endpoint
  in staged reviewers (zoom out, comprehension, design critic, intermediate zoom
  out, implementation readiness). Use when the user asks to review a design doc,
  feature spec or implementation plan.
---

# EGM Review (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`). Read `references/execution-constraints.md` relative to this skill directory; the workflow below replaces upstream delegation and remediation instructions.

You are the **Elephant**: you hold the conversation and project context. Reviewers are not you. The default engine launches fresh BB worker threads in the reviewed project environment; they can use tools according to BB permissions and require explicit consent in the Elephant Goldfish tab. The optional Advanced endpoint is a single tool-less model call containing only the persona, document standard, numbered document and chosen context files. You never write a reviewer report yourself or present your own critique as one.

## Steps

1. **Target.** Ask for the spec path if it is not given (plain chat, one question). Register it with `egm_register_spec` (project-relative path). `egm_specs` lists what is registered.
2. **Context.** Ask once whether the reviewers should get context files (source files or docs). Advanced endpoint reviewers cannot open files themselves: only what is listed is sent. BB workers retain their ordinary BB capabilities; files linked from the spec are not fetched automatically by the plugin.
3. **Preset.** Ask the human to choose one (single question):
   - `full`: stages 5–9.
   - `feature_spec`: stages 5–8.
   - `implementation`: stage 9 only.
   - `custom`: chosen lenses (`design_critic`, `structural`, `style`, `codebase_details`, …) against one standard.
4. **Start.** Call `egm_start_review` with `specId`, `preset`, `context`, and `maxRounds` (default 3). If the selected engine is unavailable, tell the human exactly why and stop. BB launches require recorded human consent in the tab; never substitute your own review or another engine.
5. **Report, don't dump.** Tell the human the review runs in the **Elephant Goldfish** tab beside this thread, where stages, findings and reports show live. Reports are written under `.egm/reviews/`.
6. **Resolve.** When `egm_review_status` shows findings, follow the **egm-resolve** skill.

## Differences from upstream

- Stages run without per-stage pause gates: findings may be decided while stages are running. After stages finish, the run waits in `awaiting_decisions` if any finding remains unresolved.
- Fixes are never written by you. You propose a full revised document with `egm_propose`; use the addressed finding IDs, or `findingIds: []` for an agreed change without findings. The proposal is bound to the spec snapshot and the human confirms the diff in the tab; only then is the file changed.
- After a confirmed change is applied and no finding is left unresolved, the plugin starts the next round on the applied version, up to `maxRounds`. Ad hoc changes wait for all findings, including partial findings from unsuccessful runs; when several changes are deferred, only the latest matching applied version is re-reviewed. They use the latest recorded review choices, or the full preset defaults if no review exists. If the file changed independently, the human must start a fresh review.
- A run that failed, was cancelled, hit a limit or went stale is not a successful review. Say so plainly.
