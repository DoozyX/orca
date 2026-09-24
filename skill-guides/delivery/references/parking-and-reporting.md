# Parking, cleanup, and reporting

Load this reference when a task cannot finish, when a done task's resources need
releasing, before the teardown check and retrospective, or when writing the
closing report.

## Parking a task

A task that cannot pass its tests, exhausts its review budget with blocking or
undecided findings, or cannot reach green checks after its fix attempts is
reported as `needs-attention`. Preserve everything: the worker terminal, the
worktree, the branch, the findings file, and every receipt. Never force-push,
reset, delete a branch, or continue silently, and never take over the work
yourself to make the number go green.

A parked task keeps its terminal. Retain it explicitly rather than releasing it,
so the next owner inherits a live session rather than a transcript.

## Releasing a done task

Release is post-settlement cleanup, never cancellation, and only an accepted
settlement authorizes it. After each accepted report, do exactly one of: reuse
the terminal for the next stage, retain it on the user's request, or release it —
all three are `orchestration` operations and that guide owns the receipts.

Repository cleanup is dispatched work, not coordinator work. Give the cleanup
worker the exact candidate list of worktrees and branches you recorded; never let
it discover or broaden its own targets, and never delete a parked task's
resources. Cleanup stays serial, because worktrees and branches share
repository-wide Git metadata.

The base ref a cleanup worker checks ancestry against is the ref the work actually
landed on — the remote-tracking ref after a fetch, not the primary checkout's
local branch, which the run never moved. A cleanup worker handed the local name
finds nothing merged into it and refuses the whole list: correctly, and uselessly.

## Teardown check

Per-task cleanup proves only that the recorded worktrees were removed. Before the
report ships, a **fresh read-only worker** — never your own reading — runs these
checks against `worktrees.md` and writes `orchestrate/teardown.md`, each command
with its output, ending in `VERDICT: clean` or `VERDICT: residue`:

| Surface          | Command                                                                                        | Residue when                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Git worktrees    | `git -C <root> worktree list --porcelain`                                                      | A run worktree marked `removed`, or one nested under the run that the table never recorded |
| Orca worktrees   | `ORCA worktree list --repo id:<repoId> --json`                                                 | A row for a `removed` worktree, or an unrecorded child of the coordinator's worktree       |
| Branches         | `git -C <root> branch --list <branch>` per recorded branch                                     | A `removed` unit's branch still exists                                                     |
| Worker terminals | `ORCA orchestration worker-list --run <run_id> --terminal-state reclaimable --json`            | Any row                                                                                    |
| Other terminals  | `ORCA terminal list --worktree id:<repoId>::<path> --json` per recorded worktree still present | A terminal in a worktree the run no longer owns                                            |
| Scratch          | The run's scratch and build-cache roots                                                        | A directory for a released unit                                                            |
| Primary checkout | The last `primary-<label>.after` against a fresh snapshot                                      | Any difference                                                                             |

On residue, give the list to a cleanup worker as exact targets, then run the
check again with a fresh worker. Whatever remains after that stays in place:
name it in the report as an open item and write `orchestrate/.needs-attention`
listing it. For a run with parked units, write `.needs-attention` first; the
checker then reports its entries as `KEEP`, because that residue is the point.

**Old runs.** Never sweep other runs' worktrees on your own initiative. With the
user's approval, a worker previews candidates from older runs' `worktrees.md` —
skipping any run with `.needs-attention`, a live worker, or a worktree with
tracked or staged changes — and the user approves that exact list before a
cleanup worker acts on it.

## Retrospective

Before the closing report, dispatch one worker to append this run's entry to
`orchestrate/retrospective.md`, which later `brainstorming` sessions read. It
reads earlier runs' `.orca/*/orchestrate/retrospective.md` first; a repeated
issue cites the earlier file and adds only the new evidence. Record only what
happened — `none` beats padding:

| Section           | Content                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| Orca issues       | Exact command, expected versus actual, enough to file an issue                     |
| Guide friction    | The rule, quoted, that misled or forced a workaround                               |
| Tiering outcomes  | Per unit: tiers used, rounds needed, escalations and their triggers                |
| Missed checks     | A lint, test, or CI check that would have caught a fix-round finding before review |
| Tool economy      | Which workers spent context on what, and what they could have been handed instead  |
| Suggested changes | One line each                                                                      |

The worker edits nothing else, commits nothing, and pushes nothing.

## Closing report

Deliver it to the user, one block per task:

```text
## <task title>
- Outcome: done | needs-attention
- PR: <url or "endgame: <what landed>"> - checks: green | failing | none
- Review: <N> review(s), <M> fix(es) counted in budget.md - clean | open items: <list>
- Models: <stage tier/model per dispatch> - escalations: <none | what and why>
- Evidence: <the command output that settled it>
- Screenshots: <orchestrate/<unit>/ capture paths> (UI units only)
- Blind A/B: <AB_SUMMARY line> (when the judge ran)
- Deferred: <items recorded and not fixed, or omit>
- Needs attention: <what is left and where it is preserved, or omit>
```

Close by naming what was released, what was deliberately preserved, the
teardown verdict, and the retrospective path. Screenshots are named only here,
never in a PR, MR, or commit. For a
verification entrance, the report instead carries the deployed identity, the arm
evidence, the adjudications, and exactly one of `pass`, `defect`, `inconclusive`.

Do not end the coordinator turn while any terminal still owes an ownership
decision, or while any task has no explicit outcome.
