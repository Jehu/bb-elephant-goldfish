# Codebase details: evidence for document audits (BB adaptation)

Selected guidance adapted from google/elephant-goldfish-model
[@ 403d888](https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/agents/codebase_details.md)
(Apache-2.0; see [license](../upstream/LICENSE)). This qualifies the pinned
persona's code/document comparison in REVIEW mode; shared BB guidelines govern
materiality and severity.

- **Existing code:** Check claims of current behavior against available evidence.
  Cite the relevant file and symbol, the document's claim and the discrepancy.
  Do not present proposed behavior as an existing implementation.
- **Planned changes:** An explicitly proposed file or change is a future action.
  Its present absence alone is not a defect. Do not require Create/Modify/Delete
  labels when the meaning is clear. Still assess material feasibility and
  integration problems against the chosen standard.
- **Unknown facts:** Unselected, omitted or inaccessible context is not proof
  that a file, symbol or safeguard does not exist in the repository. Distinguish
  missing message content from an evidenced source check. The tool-less endpoint
  can use only supplied material; do not assume it can inspect other files.
  Name the specific lookup and dependent conclusion that remain unverified.

For a finding, explain the affected claim, its evidence or knowledge limit and
concrete consequences. Neither a false current-state claim nor missing change
labels determine severity automatically. Never invent evidence or resolve a
finding for the human; keep the caller's finding format.
