# Purpose

Reproducible research about EGM behavior, separate from plugin implementation.

# Ownership

- Protocols, experiment scripts, analyses and reports live here.
- Gateway copies, environments, transcripts and other large artifacts live in
  the origin thread's storage and are linked from the reports.

# Local Contracts

- Never modify or run a production mailbox, production gateway or real EGM
  decision/apply state during these experiments.
- Freeze source revisions, prompts, scenarios and evaluation criteria before
  comparing conditions. Record exclusions and later protocol changes.
- Mark all human-proxy choices as simulated. They authorize changes only in
  experiment state/copies, never production or actual human acceptance.
- Distinguish agent output, applied state, executable checks and evaluator
  judgments. Do not treat simulated decision effort as measured human effort.
- Keep original observations, failures and unresolved outcomes. Do not silently
  replace trials. Personal skills are not part of the tested interventions.

# Work Guidance

- Prefer bounded comparisons and targeted follow-ups over new infrastructure.
- Preserve the original gateway's uncommitted work; use an independent snapshot.
- Inspect model-grader conclusions and record same-model and small-sample limits.
- Report document confirmation, accepted scope reduction, open prerequisites,
  implemented behavior and operational authority separately. Preserve known
  question-routing or conditional-approval defects in the research record.

# Verification

- Record source-copy independence, hashes and original worktree observations.
- Validate workflow source with `bb workflows validate` before execution.
- Validate transcripts, explicit proxy decisions and exact materialized revisions.
- Run only selected synthetic tests inside isolated copies; never live mail tests.
- Give subprocess mutation copies their own environment/editable installation.
  A parent-only `PYTHONPATH` override does not isolate children that sanitize it.

# Child DOX Index
