---
name: egm-drift-report
license: Apache-2.0
description: >-
  Check design documents or READMEs against the current code and write a drift
  report of where the code diverged. Use when the user asks to detect drift or
  check docs-code consistency.
---

# EGM Drift Report (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`).

This is **bounded agent analysis, not a guaranteed AST scan**. You read documents and search code; you can miss things. A report with no drift means "none found in what was checked", never "equivalent".

## Steps

1. **Input.** Ask for the directory of design documents or READMEs if not given.
2. **List** the documents. For more than 15, ask the human which to check first.
3. **For each document:** read it; note its intent, named files, symbols, APIs and behaviors; locate the code (paths named in the doc first, then code search); compare. Record per document: checked claims, matching, drifted (doc says X, code does Y, with file and line), missing in code, and what you could not verify.
4. **Write** `drift_report.md` beside the documents (or where the human says) with one section per document and a summary table: document, claims checked, drifted, unverified.
5. **Register** each drifted design doc with `egm_register_spec` so the human sees it in the Elephant Goldfish page. Changes to a registered spec go through **egm-resolve** proposals the human confirms; do not edit specs or code to "fix" drift.

Do not change source code. Do not commit.
