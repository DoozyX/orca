# Parking, cleanup, and reporting

Load this reference when a task cannot finish, when a done task's resources need
cleaning up, before the teardown check and retrospective, or when writing the
closing report.

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
after a fetch, not the primary checkout's local branch, which the run never
moved) and removes one candidate at a time, because worktrees and branches share
repository-wide Git metadata.

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

## Closing report

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
