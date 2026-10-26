# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Project Guidance

- This repository implements a BB spec workspace adapting `google/elephant-goldfish-model`; see `README.md` for installation and workflows.
- The root owns project-wide guidance and configuration. `.bend.json` selects Beads; `.beads/` holds its configuration and tracker data.
- Development checks are `npm run typecheck`, `npm test`, and `npm run build` (Node 24); reload with `bb plugin reload elephant-goldfish`.
- Elephant UI actions draft requests only into the matching existing thread's BB composer; the human reviews, edits and explicitly sends. Never send or start an Elephant turn automatically, replace an occupied draft, or guess a thread from the project page. Preserve existing text, mentions and attachments when the user chooses to append; cancelling an in-flight contextual append must prevent its eventual workspace search result from changing the draft.
- Applying proposed changes requires explicit confirmation, a version check, a retained backup and atomic replacement. External editors are not locked; concurrent edits can be overwritten, so coordinate writers.
- Repository-owned work is MIT-licensed in `LICENSE`. Preserve upstream license and attribution requirements when importing third-party code or skills.
- `.gitignore` excludes dependencies, generated output, secrets, logs, local Noema database/lock files, and EGM staging and pre-image files; review reports remain versionable.

## Child DOX Index

- [`bb-elephant-goldfish/AGENTS.md`](bb-elephant-goldfish/AGENTS.md) — Noema cortex identity and trace mutation contract for `bb-elephant-goldfish/`.
- [`server/AGENTS.md`](server/AGENTS.md) — review engine, persistence and workspace safety contracts.
- [`skills/AGENTS.md`](skills/AGENTS.md) — adapted agent skills and bundled references.
- [`upstream/AGENTS.md`](upstream/AGENTS.md) — pinned third-party source materials and licensing.

<!-- airbender:rules:start -->
<!-- airbender:rules:version 4 -->
## Working with issues through Airbender

This repository's issues are worked from the Airbender tab in BB, and read
and changed with the `bend` command, whatever tracker holds them. These are
the instructions for working on issues here; follow them whenever you work
on one.

**Issues only through `bend`.** Do not read or change an issue with the
tracker's own program (`bd`, `gh`) or on its website, even where that
would work: `bend` keeps things with an issue that those do not know of,
and what is done around it shows in the Airbender tab late or wrongly.

The commands you need (`bend <command> --help` says more, and `bend status`
says which tracker this repository uses):

- `bend show <id>` and `bend comments <id>`: read an issue and its history.
- `bend write <id> description "..."`, `bend write <id> done "..."` and
  `bend write <id> plan "..."`: write what is wanted, what "done" means,
  and the plan. `bend start <id>`: mark it started; `bend stop <id>`:
  put it back to open when the work is set aside.
- `bend comment <id> "..."`: record a surprise or a hand-over;
  `bend decide <id> "..."`: record a decision and its reason;
  `bend note <id> "..."`: add to its notes, for progress worth resuming
  from.
- `bend create "..." --from <id>`: follow-up work, linked to the issue it
  came from.
- `bend link <id> <other-id> --kind blocked-by`: this issue waits for the
  other one.
- `bend list` and `bend ready`: what there is, and what can be worked on.

- **Facts and memories are kept in [`FACTS.md`](FACTS.md).** It is the
  place to store what every later session should know: how to build, a
  convention, a lasting preference of the user's. It is not loaded for
  you: open it when you start on something it may bear on. Add to it as
  one line, `- **short-key** — the fact`; `bend remember "..."` adds one
  for you, and `bend recall` shows them.

- **Every piece of work has an issue.** If the user asks for something that
  has no issue yet, create one first (`bend create`), with what is wanted and
  why, and what "done" means (`bend write <id> done "..."`).
- **A question is not work.** A plain question or a discussion needs no
  issue: answer it in the conversation. Where it ends in a decision worth
  keeping, offer to record it.
- **Make the issue you work on the thread's current issue**, by calling the
  `airbender_set_current` tool with its id as soon as you start, also when you
  created the issue yourself. The user sees in the Airbender tab, and
  above the message box, which issue the thread is on.
- **The repository's owner chooses its workflow** in the Airbender tab:
  standard, where every issue goes through steps, or simple, with no steps.
  You are told which one applies when you set your current issue with
  `airbender_set_current`, and again if the user switches it. On the standard
  workflow the rules below marked "(standard)" apply. On the simple
  workflow there are no steps to report (the `airbender_workflow_move` tool
  refuses and says so): the user directs the work in the conversation and
  closes issues themselves.
- **(standard) An issue takes only the steps its size needs.** When you
  are started on an issue that has no size, size it first: S (small: done
  in one go, the user sees it once, at the end), M (medium: definition and
  plan together, one review, then the result) or L (large: every step). In
  doubt, take the larger. The user can set or change the size. When you
  create an issue yourself you may give it a size, with the label
  `size:s`, `size:m` or `size:l` (`bend edit <id> --add-label size:m`).
- **(standard) Every issue goes through its workflow.** Do the step you are
  started on only, and report it with the `airbender_workflow_move` tool when
  it is finished. You may move an issue to another step when that is where
  the work really is, with your reason, but never forward past a review
  that is the user's (of the definition, of the plan, of the finished
  work). While an issue waits for the user: if their reply asks for
  changes, move it back and redo the work; if they approve, record that,
  quoting them; if it is only a question, answer it.
- **Ask the issue's open questions first.** Being started on an issue is not
  permission to assume the answers. Record each answer on the issue.
- **Record as you go.** Decisions and their reasons, things that did not
  work, and progress go on the issue (`bend decide`, `bend comment`,
  `bend note`). Follow-up work becomes its own issue, linked to the one it
  came from.
- **Do not close the issue.** When the work is done, add a comment saying
  what you did, how you checked it and what you did not check, and tell the
  user it is ready to validate. Never close an issue unless the user tells
  you to close that issue: not with `bend close`, not with the tracker's
  own program, and not by closing words in a commit or a pull request
  ("fixes #12", "closes #12"). On the standard workflow it closes when its
  last step is reported done, on the simple one the user closes it.
- **(standard) Commit when the user has accepted the issue and chosen
  how**, not before. That is the workflow's last step: one commit per
  issue, only that issue's files, with the issue's id and title as the
  subject line. A merge only when the user chose "Commit & merge": then
  also push the main branch and, after that, delete the issue's branch
  locally and on the remote. An issue the user starts "in a new branch"
  tells you the branch to create first. In a conversation opened for one
  issue in a work tree, follow the landing order that step gives you, and
  leave the work tree and its local branch to Airbender.
- **(standard) An epic can have a branch for all of its issues.** The user
  starts an issue that has sub-issues "in a branch" or "in a work tree":
  you then only create the branch (or say which branch the work tree is
  on) and start no work. The epic waits at the step "On its branch". Its
  issues are started one at a time, in a folder on that branch only, and
  each is committed there and never merged by itself. The branch is merged
  once, when the user closes the epic with "Close & merge".
- **On the simple workflow, commit only when the user asks.**
<!-- airbender:rules:end -->
