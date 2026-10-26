# Server workflow engine

## Purpose

Review execution, version provenance, finding decisions and human-confirmed
spec changes for the Elephant Goldfish BB plugin.

## Ownership

- `contract.ts`: validated RPC schemas and frontend/server types.
- `store.ts`: plugin SQLite migrations and persistence.
- `engine.ts`: run/stage/finding/proposal lifecycle and restart reconciliation.
- `goldfish.ts`: fresh, tool-less OpenAI-compatible review calls.
- `prompts.ts`: pinned personas/standards, presets and finding parser.
- `workspace.ts`: confined file reads and compare-and-replace apply protocol.
- `diff.ts`: unified diff generation.
- Root `server.ts` owns BB registration and the Elephant agent tools.

## Local Contracts

- Goldfish has no tools or conversation history. Never replace it with a BB
  thread whose read-only behavior cannot be enforced.
- Confirmed proposal apply checks the base version, retains a backup, atomically
  replaces the target and checks the result. Restart reconciles apply intents,
  including their operation receipts; an unknown outcome retains the backup and
  releases findings still attached to that proposal. External editors are not
  locked and may race with or overwrite the replacement.
- A proposal may address no findings; if it addresses findings, they must all
  belong to the same review run. An outstanding apply intent blocks
  any other apply for the spec, rejection, decisions and reproposals of its
  original findings, new reviews, and forgetting the spec; refresh preserves its
  proposal and finding ownership. Conflict resolution releases its findings for
  immediate reproposal.
  Forgetting is serialized with review and apply and is blocked by active runs.
  Reconciliation retains intents on transition failure; orphan intents and their
  workspace files are retained and reported without blocking plugin startup.
- Distinguish fixed, accepted trade-off and dismissed findings. Rejecting a
  shared proposal releases its other findings without detaching findings claimed
  by a newer proposal. Starting a new review finishes superseded waiting runs.
- Automatically re-review only after a confirmed change and no unresolved
  decisions, including decisions made while stages run. Bind continuation to
  the applied result hash; a different current version makes the run stale.
  Never hide cancellation, limits, stale versions or partial results.
- Append SQLite migrations; never alter or reorder shipped migrations.
- Specs/reports remain Markdown; SQLite is the durable workflow index.
- Elephant tools must only access specs and findings owned by their invoking
  project. Composer requests are drafts only; the human sends them.
- Workspace search resolves the thread environment and returns confined regular
  files only when its host and checkout match the server-local project root.
  Missing or mismatched workspaces and search failures are reported, not guessed.

## Work Guidance

- Use Zod at external boundaries; do not trust provider output or RPC input.
- Keep tests about behavior/transitions and plausible consumer-visible bugs.

## Verification

- `npm run typecheck`
- `npm test`: real temporary SQLite and workspace files, no wall-clock sleeps.
- `npm run build`; then `bb plugin reload elephant-goldfish` for a live check.

## Child DOX Index

None.
