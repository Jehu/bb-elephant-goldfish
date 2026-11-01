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
- `review-guidelines.md`: canonical shared BB review rules, injected through
  `server.ts` agent configuration and every Goldfish stage; keep under 4096 characters.
- `workspace.ts`: confined file reads and compare-and-replace apply protocol.
- `checkouts.ts`: BB environment resolution, server-local host verification and
  validation of persisted checkout identities.
- `diff.ts`: unified diff generation.
- Root `server.ts` owns BB registration and the Elephant agent tools.

## Local Contracts

- Advanced endpoint reviews have no tools or conversation history; reject tool-call
  responses. BB-worker reviews are intentionally distinct: they require explicit
  consent, use the run's captured project/environment, obey BB permissions, and
  persist each worker ID for stop/archive cleanup and restart reconciliation.
- Runs select their reviewer engine at launch and continuations retain that
  selection; never silently fall back between BB workers and the endpoint.
- An endpoint key is only ever sent to the currently configured endpoint; runs
  pinned to another endpoint fail visibly ("endpoint changed") instead of
  combining a stored endpoint with the live key. Response bodies from endpoint
  errors are never persisted or rendered; errors carry the HTTP status only.
- Confirmed proposal apply checks the base version, retains a backup, atomically
  replaces the target and checks the result. Restart reconciles apply intents,
  including their operation receipts; an unknown outcome retains the backup and
  releases findings still attached to that proposal. External editors are not
  locked and may race with or overwrite the replacement.
- Confirmed apply resolves the configured reviewer before any file mutation and
  pins that snapshot in the apply intent and the deferred ad hoc task; crash
  reconciliation reuses the pinned snapshot (legacy intents resolve one via the
  settings hook). A pending ad hoc task without a pinned reviewer refuses to
  start instead of guessing an engine.
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
- Review inputs include historical, non-superseded human finding decisions from
  the same spec, with rationale, current finding state and source run/reviewed
  hash. Keep complete entries within a separate 32,000-character JSON-array
  budget and report omissions; history never suppresses new findings or implies
  current validity. Forward recorded missing/refused/over-budget context notes
  by spec and run, independent of the general recent-event limit.
- `egm_review_status.reviewContext` uses the same projection with the current
  file hash and latest run's notes. It is not a complete register of chat or
  external decisions; document confirmation grants no operational authority.
- Automatically re-review only after a confirmed change and no unresolved
  decisions, including decisions made while stages run. Bind continuation to
  the applied result hash; a different current version makes the run stale.
  Never hide cancellation, limits, stale versions or partial results.
- Append SQLite migrations; never alter or reorder shipped migrations.
- Specs are unique by project, host, canonical checkout root and relative path.
  Bind the checkout at registration; never retarget an existing spec when a
  thread, environment path or preferred project source changes. Runs, context,
  reports, proposals, apply and automatic reviews use that binding. BB workers
  require its explicit environment, never the project default.
- Legacy specs require explicit checkout assignment before file operations.
  Keep their IDs and history; proposals without checkout provenance cannot be
  applied. Binding stales legacy pending proposals and completed/waiting runs,
  releases proposal findings and removes deferred automatic review tasks.
- The checkout migration replaces the referenced specs table. Disable foreign
  keys outside the migration transaction, restore them in finally, and check
  foreign_key_check. Preserve every dependent row and any saved apply target.
- Specs/reports remain Markdown; SQLite is the durable workflow index.
- Elephant tools must only access specs and findings owned by their invoking
  project. Composer requests are drafts only; the human sends them.
- Workspace search and thread-scoped tools resolve the actual thread checkout,
  including worktrees. Refuse cross-checkout mutations, unavailable environments
  and remote hosts, even when paths or file hashes match. A temporary random
  marker read through the host SDK verifies server-local filesystem visibility;
  dispose it on unload. Historical links keep the registered spec's target.

## Work Guidance

- Use Zod at external boundaries; do not trust provider output or RPC input.
- Keep tests about behavior/transitions and plausible consumer-visible bugs.

## Verification

- `npm run typecheck`
- `npm test`: real temporary SQLite and workspace files, no wall-clock sleeps
  (exception: the registered-RPC smoke polls the background run once against a
  live stub endpoint).
- `server/worktrees.test.ts`: real Git worktrees, legacy migration/reference
  preservation, pinned review context/reports/environments and apply recovery.
- `npm run build`; then `bb plugin reload elephant-goldfish` for a live check.

## Child DOX Index

None.
