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

## Steps

1. **Ingest.** Read the predecessor (a `concepts_brief.md` or notes the human names). Summarize what you take from it in a few lines and ask what is missing.
2. **Sections, one at a time**, each written into `design_draft.md` (or the path the human names) and each followed by the approval gate (one question: approve and continue / request revisions):
   1. Overview, goals and problem statement.
   2. Technical plan.
   3. Alternatives considered.
   4. Implementation (begin it with `## Detailed Implementation Plan`, so later reviews can split feature and implementation parts).
3. **Finalize.** Move the approved draft to `docs/designs/<feature>.md` (ask for the name), register it with `egm_register_spec`, and offer **egm-review**.

## BB notes

- While drafting, the draft is yours to edit: the human approves each section in chat. Once it is registered and reviewed, it is a spec under review: from then on change it only through **egm-resolve** proposals the human confirms.
- Do not present whole sections in chat; point to the file and summarize the two or three decisions that matter.
