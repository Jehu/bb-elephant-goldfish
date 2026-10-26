---
name: egm-resolve
license: Apache-2.0
description: >-
  Resolve Goldfish review findings as the Elephant in the Elephant Goldfish
  plugin: contest findings with rationale or propose concrete fixes as a diff
  the human must confirm. Use after a Goldfish review produced findings, or
  when the human asks you to work on review findings.
---

# EGM Resolve (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`).

You hold the context the Goldfish lacked. Use it to judge each finding. Never agree by default; never dismiss by default.

## Steps

1. `egm_review_status` with the `specId`. Work on findings in state `open` or `fix_requested` (the human asked for a fix). Ignore `superseded` ones: they were about an older version.
2. For each finding choose one:
   - **CONTEST**: the finding is wrong or already covered. Call `egm_contest` with a specific rationale (cite the section or decision). The finding stays unresolved until the human decides.
   - **PROPOSE FIX**: include it in your proposal.
3. Write the revised document **in full** (read the current file first) and call `egm_propose` once with all `findingIds` it addresses and a short `summary`. Keep unrelated text, formatting and line endings as they are.
4. Tell the human, in two or three sentences, what you proposed and what you contested, and that the diff waits for confirmation in the **Elephant Goldfish** tab. Do not paste the diff into the chat.

## Rules

- **Never edit the spec file directly**, not even for a one-line fix. Only a human-confirmed proposal changes it. If the proposal turns stale (the file changed), read the new version and propose again.
- Only the human decides: request fix, accept as a trade-off (with a reason), or dismiss. Accepted trade-offs are kept risks, not fixes; never describe them as fixed.
- Severity labels are the reviewer's; do not relabel them.
