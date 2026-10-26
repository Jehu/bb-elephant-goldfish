---
name: egm-brainstorm
license: Apache-2.0
description: >-
  Stress-test a raw feature idea with the EGM brainstorm: clarify the problem
  with the human, write a concepts brief, and let six fresh Goldfish lenses
  challenge it through the Elephant Goldfish plugin. Use when the user wants to
  brainstorm, explore or pressure-test a concept before drafting a design.
---

# EGM Brainstorm (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`). Read `references/execution-constraints.md` relative to this skill directory; the BB workflow below replaces its upstream delegation instructions.

## Steps

1. **Clarify.** Drill the problem with the human, one question at a time: the problem, who has it, what success looks like, what is out of scope. Anchor a one-paragraph feature hypothesis and get explicit agreement that it is ready for review.
2. **Brief.** Write `docs/concepts/<feature>/concepts_brief.md` with the upstream structure: `# [Feature Name]`, `## Overview`, `## Analysis`, `## Goals vs. Non-Goals`, `## Key Decisions & Staging for Next Steps`. This first version is yours to write; it is the brainstorm's own artifact, not a reviewed spec.
3. **Goldfish lenses.** Register the brief (`egm_register_spec`) and start `egm_start_review` with `preset: "brainstorm"`. Six lenses (design critic, codebase details, zoom out, comprehension, implementation readiness, structural) run in parallel in BRAINSTORM mode. If review is unavailable, say why and stop; do not invent their objections.
4. **Iterate.** Walk the human through the objections (they are listed in the Elephant Goldfish tab). For each, discuss and let the human decide. Fold agreed changes in through `egm_propose` so the human confirms each revision. Supply the IDs of findings addressed, or `findingIds: []` for an agreed change without a finding; never invent one. After confirmation and resolution of outstanding findings, the plugin re-runs the lenses on the revised brief, subject to the round limit and snapshot checks.
5. **Hand off.** When the human is satisfied, offer **egm-draft** with the brief as its predecessor context.
