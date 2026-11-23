# Parking, cleanup, and reporting

Load this reference when a task cannot finish, when a done task's resources need
cleaning up, before the teardown check and retrospective, or when writing the
overview or the closing report.

## Parking a task

A task that cannot pass its tests, spends its review budget with blocking or
undecided findings, or cannot reach green checks is `needs-attention`. Keep its
worktree, branch, findings files and ledger rows, and name in the report where
each is and what is uncommitted. Force-pushing, resetting, deleting the branch,
or finishing the work yourself would remove what the next owner needs to judge
it.

An Orca worker closes on its own after it reports. Keep one open for a parked
task only when the next owner needs the live session:
`ORCA orchestration worker-keep-open --dispatch <dispatch_id>`. A message to a
closed worker reopens it, so closing loses nothing.

## Cleaning up a done task

Cleanup is a dispatched stage. Give the cleanup agent the exact list of
worktrees and branches from the manifest's unit rows, minus every parked unit.
It checks ancestry against the ref the work landed on (the remote-tracking ref
after a fetch, not the primary checkout's local branch, which the run's own
steps never move; Orca's refresh setting may) and removes one candidate at a
time, because worktrees and branches share repository-wide Git metadata.

Before a worktree is removed, copy the artifacts a reported result cites (test
bundles, captures, provenance) to `orchestrate/evidence/<unit>/` and record
source, destination and hash in one list. Build and dependency caches are not
evidence.

## Teardown check

Before the closing report, a fresh read-only stage agent checks the manifest's
unit rows against reality and writes `orchestrate/teardown.md`, each command with
its output, ending in `VERDICT: clean` or `VERDICT: residue`:

| Surface          | Command                                                                        | Residue when                                                           |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Worktrees        | `git -C <root> worktree list --porcelain`; `ORCA worktree list --json`         | A cleaned-up unit's worktree exists, or an unrecorded child of the run |
| Branches         | `git -C <root> branch --list <branch>` per recorded branch                     | A cleaned-up unit's local branch exists                                |
| Stage agents     | The unit rows' dispatches against the coordinator's agent list                 | An agent still running that the report does not name                   |
| Worker terminals | `ORCA orchestration worker-list --run <run_id> --json`, when the run has a Run | A worker still open that is neither parked nor kept open on request    |
| Primary checkout | The primary checkout guard in `task-pipeline.md`                               | Any difference except a verified forward HEAD advance                  |

On residue, hand the list to a cleanup agent as exact targets and check once
more. What remains stays in place, named in the report as an open item. A parked
unit's resources are not residue.

After a primary checkout guard stop, only this check, the retrospective (with
its issue filing) and the overview stages are still dispatched, in that order,
and they stay read-only: no editing
tracked source, switching, resetting or stashing, pushing, merging, deploying, or
removing a worktree, branch or terminal. They write only under the run's
`orchestrate/` directory, except that the retrospective agent may run
`gh issue list`, `gh issue create` and `gh issue comment` against `DoozyX/orca` as
in "Filing Orca issues". The residue list is not handed to a cleanup agent. The
primary row stays `residue` for the difference, and the closing report names it
and the rest of the list as open items; neither agent repairs anything. If no
read-only agent can be launched, the coordinator writes these notes and does the
filing itself within the same limits, and labels the independent check
`unperformed` in the report.

Other runs' worktrees are out of scope unless the user asks; then show the
candidate list and wait for approval of that exact list.

## Known issues

At closing, update `<root worktree>/.orca/known-issues.md`: add rows, bump `seen`
and `last-seen`, and remove a row a landed sha fixes, naming that sha in the
report. The file is ignored, never committed, and holds no secrets. Rows come
from `defer` items, `nit-skipped` lines, logic-changing nits, and flakes.

```text
| id (KI-<n>, never reused) | kind (flake|pre-existing|nit|deferred) | location | summary | first-seen | last-seen | seen | source (<run>/<unit> R<r>.<n>) |
```

## Retrospective

Every run gets one. Before the closing report, one stage agent appends this
run's entry to `orchestrate/retrospective.md`, which later `brainstorming`
sessions read. It reads earlier runs' retrospectives first; a repeated issue
cites the earlier file and adds only new evidence. Write `none` under a section
with nothing to record, and keep the entry under about 60 lines.

| Section                | Content                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `## Orca issues`       | Exact command, expected versus actual                                                       |
| `## Guide friction`    | The rule, quoted, that misled or forced a workaround                                        |
| `## Models`            | Per unit: models used, rounds needed, escalations and their triggers                        |
| `## Missed checks`     | A lint, test or CI check that would have caught a fix-round finding before review           |
| `## Review metrics`    | Output of `ORCA orchestration review-metrics --run <this run dir> --run <previous run dir>` |
| `## Escapes`           | `ESCAPE:` lines, or `none`                                                                  |
| `## Suggested changes` | One line each                                                                               |

An escape is a defect found after a clean review:
`ESCAPE: <unit> - <ci|integration|ab-judge|user> - <file>:<line> - <what> - missed-by: <layer> - fix-at: <guide|lint|known-issues|test|none>`.

`--run` takes a run directory, not a Run id. A `parseErrors` entry names a
findings or dispositions file its author should correct; quote any left
unresolved. On an SSH host without the Orca CLI, the section says
`metrics: unavailable on <host>`.

## Filing Orca issues

Entries whose fix belongs in Orca (the CLI and runtime, orchestration, terminals
and hooks, a bundled guide) are filed in `DoozyX/orca`, where an automation picks
up open issues labelled `retro`. The retrospective agent files them after
writing; entries about the target repository stay in the retrospective.

Per entry, search first, then file or comment:

```text
gh issue list -R DoozyX/orca --label retro --state all --search "<key phrase> in:title" --json number,title,state,url
gh issue create -R DoozyX/orca --label retro --title "<area>: <expected vs actual, one line>" --body-file <path>
gh issue comment <number> -R DoozyX/orca --body-file <path>
```

An open match gets a comment with only the new evidence; a closed match is a
regression and gets a new issue citing it. The body carries the exact command,
expected versus actual, `ORCA --version`, and the quoted rule for guide friction.
Leave out secrets and the target repository's source, private names and URLs.
The agent reports one `ISSUE: <url> filed|commented` line per entry; a `gh`
failure stays in the retrospective as `unfiled: <error>`.

## Overview

A run whose input was an approved design or spec document, or whose manifest has
two or more unit rows, closes with `orchestrate/overview.md`: what was built, for
a reader who saw none of the run. A verification entrance never gets one. Either
condition is enough, so a one-step design gets one.

Sections, in this order. Only `## Deploy order` may be left out, and everything
above `## Per-task evidence` stays within 250 lines; shorten `## How it was done`
first.

| Section                                                        | Content                                                                                                                                                                                                                                    | Nothing to say                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `# <ticket or title> overview`, then `Status on <YYYY-MM-DD>:` | One short paragraph: what is done, what is waiting, and on whom                                                                                                                                                                            | Never empty                                                                      |
| `## What it does`                                              | The change as a numbered flow in plain language. A component diagram naming the PR on each component when units changed three or more repositories or services; a sequence diagram when the changed components call each other at run time | Never empty                                                                      |
| `## How it was done`                                           | Design path and revision, dates, a unit-dependency diagram when the run had two or more units, each budget override with its decision id                                                                                                   | Never empty                                                                      |
| `## Pull requests`                                             | `# \| Repo \| PR → target \| What it does`, and a merge-order diagram when any unit was stacked on another                                                                                                                                 | A unit with no PR puts what landed there (`<merge sha> → <target>`), or `parked` |
| `## Deploy order`                                              | Numbered list with the config each step needs                                                                                                                                                                                              | Left out when units changed one separately released service, app or package      |
| `## Still open`                                                | Parked units, blocked items, counts of known and deferred items with their file paths                                                                                                                                                      | `none`                                                                           |
| `## Actions for you or ops`                                    | Secrets to rotate and other security follow-ups first, then defects found in code the run did not change, then requests to other people                                                                                                    | `none`                                                                           |
| `## Next steps`                                                | What happens after the run, and exactly what is needed from whom                                                                                                                                                                           | `none`                                                                           |
| `## Per-task evidence`                                         | One closing-report block per task, as below, under a `###` heading                                                                                                                                                                         | Never empty                                                                      |
| `## Run figures`                                               | Reviews and fixes per unit, overrides, what was cleaned up and kept, the teardown verdict, the retrospective path, each filed issue's URL                                                                                                  | Never empty                                                                      |

Diagrams are Mermaid fences, and nobody in the run sees them rendered, so they
keep to syntax that parses:

- Only `flowchart` and `sequenceDiagram`, with at most 15 nodes or 8
  participants; split a larger one.
- Node, subgraph and participant ids are letters and digits only.
- In a flowchart, every node label, edge label and subgraph title is in double
  quotes: `id["text"]`, `-->|"text"|`, `subgraph id["text"]`. A line break is
  `<br/>`, never in a subgraph title, where the second line is hidden; no other
  HTML.
- In a sequence diagram, participant aliases and message text are plain text
  with no `;`, `#` or line break.
- No `style`, `classDef`, `click` or `linkStyle`.
- One sentence above each diagram says what an arrow means.

Two stages produce it, after the retrospective. Neither reserves or settles a
ledger row.

1. **Overview.** One agent writes the file from each unit's
   `<base sha>..<head sha>` diff and its PR, not from the stage reports: a
   document drafted from run records repeats their mistakes. A unit whose
   commits cannot be read gets `not verified: commits unreachable` in its
   `## Pull requests` row and a line under `## Still open`.
2. **Overview review.** A fresh read-only agent checks every status code, URL
   shape, name, branch target, order and diagram edge against the same diffs,
   and every Mermaid block against the rules above. It writes
   `orchestrate/overview.findings.md`, one line per finding, ending in
   `VERDICT: accurate` or, with any finding at all, `VERDICT: fix-needed`.

On `fix-needed`, send the findings path to the same writer when it can still be
continued, otherwise to a fresh Overview dispatch. The writer fixes each finding
or disputes it with evidence, and marks its line `fixed` or `disputed: <why>`.
There is no second review; the run closes either way.

**Keeping it current.** A later session that changes a closed run's state (a PR
merged, a blocker cleared, a next step done) edits in place the `Status on` line
with the new date, PR state in `## Pull requests`, `## Still open`,
`## Actions for you or ops` and `## Next steps`; these edits need no review. A
change to `## What it does`, `## Deploy order` or a diagram is a fresh Overview
dispatch followed by an Overview review.

## Closing report

For a run with an overview, the closing report is `overview.md`, and the chat
message is its status paragraph, its absolute path, the `## Still open` and
`## Actions for you or ops` items, and each disputed finding with the findings
path. For every other run it is the chat message itself.

One block per task:

```text
## <task title>
- Outcome: done | needs-attention
- PR: <url or "endgame: <what landed>"> - checks: green | failing | none
- Review: <the ledger's "reviews n/3 fixes n/2" line> - clean | open items: <list>
- Models: <stage, model, subagent|worker per dispatch> - escalations: <none | what and why>
- Evidence: <the command output that settled it>
- Screenshots: <capture paths> (UI units only)
- Deferred: <items recorded and not fixed, or omit>
- Needs attention: <what is left and where it is preserved, or omit>
```

Close with what was cleaned up, what was kept on purpose, the teardown verdict,
the retrospective path, and each filed issue's URL. For a verification entrance
the report carries the deployed identity, the arm evidence, the adjudications,
and exactly one of `pass`, `defect`, `inconclusive`.
