---
name: egm-bootstrap
license: Apache-2.0
description: >-
  Bootstrap EGM-compliant README contracts across a directory tree: leaf
  component READMEs (peanuts) rolled up into parent blueprints (hay). Use when
  the user asks to document an existing codebase with EGM READMEs.
---

# EGM Bootstrap (BB adaptation)

Adapted from google/elephant-goldfish-model @ 3d0b348 (Apache-2.0; see `LICENSE`). Read `references/bootstrap-orchestrator.md` and use `references/templates.md`, both relative to this skill directory; the BB workflow and constraints below replace upstream delegation instructions.
Selected source-verification guidance also adapts
[upstream changes @ 403d888](https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-bootstrap/SKILL.md).

## Constraints

- **Documentation only.** Never write or refactor source code.
- **No commits.** The human tracks and commits.
- **Discovery** level by level (no recursive `find`/`ls -R`). Skip symbolic links. Skip `.git`, `node_modules`, `venv`, `dist`, `build`, `third_party` and everything matched by `.gitignore` and `.egmignore`.
- **Safety gate.** When more than **15** directories are discovered, stop discovery and ask the human (one question) before continuing with the full tree.
- **Target file** defaults to `README.md`; use `EGM.md` when existing READMEs are human-maintained and must not change. Ask if unsure.
- **Workers.** If you spawn BB child threads for subtrees, they work in this checkout: tell each one its subtree, the target filename and the constraints above. Their working notes go to the thread storage, not the repository.

## Source checks and updates

- Within the approved scope, inspect the sources behind contract claims. Cite
  the relevant file and actual symbol, flag or schema/table declaration. Do not
  infer an interface, invariant or side effect from a filename. Check imports
  and build dependencies before attributing behavior across component boundaries;
  diagrams must match the relationships you verified.
- Read existing target documents before editing. Correct only what the evidence
  requires, preserving accurate content and human notes. Describe unexamined
  areas and uncertain claims explicitly; a partial inspection is not proof of
  completeness or absence. Do not expand discovery to fill every gap.
- Derive verification commands from actual manifests, scripts or build rules,
  including the working directory and relevant target. Only use Bazel syntax
  for a Bazel project, checking target patterns against its build definitions.
  A listed command is not authorization to execute it. Run only checks allowed
  by the current task; otherwise state that they were not run and why. Report
  actual success or failure separately from a suggested command.

## Final pass

Before registering the blueprint, read every created or modified contract,
including child contracts. Check its source claims, existing diagrams, Markdown
and links. Resolve relative file links from the containing document and check
their targets, including referenced anchors. Correct or remove broken links;
identify any references you could not verify. Recheck command definitions,
working directories and targets without implying that inspection executed them.

Briefly report which contracts and sources were checked, any checks actually
run and their results, and remaining limits. Do not claim a complete review of
unread sources or successful tests that were only suggested.

## After bootstrapping

Register the generated top-level blueprint with `egm_register_spec` and offer **egm-review** with `preset: "custom"`, lenses `structural` and `style`, so a Goldfish checks the contracts with fresh eyes.
