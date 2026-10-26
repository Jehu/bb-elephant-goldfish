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

## Constraints

- **Documentation only.** Never write or refactor source code.
- **No commits.** The human tracks and commits.
- **Discovery** level by level (no recursive `find`/`ls -R`). Skip symbolic links. Skip `.git`, `node_modules`, `venv`, `dist`, `build`, `third_party` and everything matched by `.gitignore` and `.egmignore`.
- **Safety gate.** When more than **15** directories are discovered, stop discovery and ask the human (one question) before continuing with the full tree.
- **Target file** defaults to `README.md`; use `EGM.md` when existing READMEs are human-maintained and must not change. Ask if unsure.
- **Workers.** If you spawn BB child threads for subtrees, they work in this checkout: tell each one its subtree, the target filename and the constraints above. Their working notes go to the thread storage, not the repository.

## After bootstrapping

Register the generated top-level blueprint with `egm_register_spec` and offer **egm-review** with `preset: "custom"`, lenses `structural` and `style`, so a Goldfish checks the contracts with fresh eyes.
