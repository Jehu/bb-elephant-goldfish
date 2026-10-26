# Upstream EGM materials

## Purpose

Pinned source materials from `google/elephant-goldfish-model` at commit
`3d0b34821ce88ad328b0c9bf0e06d7eb5f1cd669`, used by the BB adaptation.

## Ownership

- `agents/`: reviewer personas and the bootstrap orchestrator.
- `document_standards/`: criteria applied by review stages.
- `skills/`: original skill instructions and referenced templates/schemas.
- `execution_instructions.md`: upstream shared execution rules.
- `LICENSE`: Apache-2.0 license for these materials.

## Local Contracts

- Keep copied files unmodified. Adapt BB behavior under root `skills/` and
  `server/`, not here.
- Preserve license and provenance in root `NOTICE` when updating the pin.
- These documents describe upstream behavior, not BB SDK guarantees.

## Work Guidance

- Runtime review prompts import the personas and standards as text; the
  originals are also source references for the adapted skills.

## Verification

- `npm run build` bundles the imported Markdown into the server bundle.
- `npm test` loads the same sources through `test/md-loader.mjs`.

## Child DOX Index

None.
