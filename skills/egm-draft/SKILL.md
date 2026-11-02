---
name: egm-draft
license: Apache-2.0
description: >-
  Draft an EGM design document section by section with explicit human
  approval of each section, from a concepts brief or notes. Use when the user
  wants to write a design document or feature spec.
---

# EGM Draft (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`). Read `references/execution-instructions.md` and use `references/design_doc.md` as the template, both relative to this skill directory.

Selected predecessor-reading and finalization guidance adapted from [upstream @ 403d888](https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-draft/SKILL.md); the BB decision and approval rules below take precedence.

The plugin supplies the shared review guidelines directly as agent instructions.
Use this drafting workflow when a design document is needed; a small change to
an existing document does not require a new full design draft.

## Steps

1. **Ingest.** Read the predecessor (a `concepts_brief.md` or notes the human names),
   including recorded decisions, alternatives and their reasons; do not reconstruct
   them from memory. Summarize the inherited decisions in a few lines. For an older
   brief or notes without a named alternatives section, first read the available
   content and context. A missing heading alone requires neither a question nor a
   new brainstorm. Keep undocumented history distinct from “no alternatives were
   discussed”; investigate source facts and ask only about decision-relevant gaps,
   with a recommendation. Reuse settled decisions unless new facts, changed
   assumptions or a material contradiction justify revisiting them.
2. **Sections, one at a time**, each written into `design_draft.md` (or the path the human names) and each followed by the approval gate (one question: approve and continue / request revisions):
   1. Overview, goals and problem statement.
   2. Technical plan.
   3. Decision-relevant alternatives, carrying forward the predecessor's actual options and reasons, with a recommendation and user-visible limits. If no useful alternative affects the decision, say so briefly rather than inventing a counterarchitecture.
   4. Implementation (begin it with `## Detailed Implementation Plan`, so later reviews can split feature and implementation parts).
3. **Finalize.** Before moving or registering the approved draft, re-read the
   predecessor and compare it with the entire draft, accounting for recorded human
   decisions made during drafting. Show unresolved material contradictions and new,
   unapproved decisions affecting architecture, external interfaces or dependencies,
   citing the relevant passages and explaining the consequences with a recommendation.
   Stop and wait for the human's decision before changing the draft or completing
   finalization; do not silently make it match the brief. Then reflect that decision
   in the affected sections and obtain their approval again. For a spec under review,
   use the human-confirmed `egm_propose` path instead of direct edits. Unchanged
   decisions and equivalent implementation details need no new decision gate.
   If there is no material divergence, say so briefly and continue. Move the approved
   draft to `docs/designs/<feature>.md` (ask for the name), register it with
   `egm_register_spec`, and offer **egm-review**.

## BB notes

- While drafting, the draft is yours to edit: the human approves each section in chat. Once it is registered and reviewed, it is a spec under review: from then on change it only through **egm-resolve** proposals the human confirms.
- Do not present whole sections in chat; point to the file and summarize the two or three decisions that matter.
