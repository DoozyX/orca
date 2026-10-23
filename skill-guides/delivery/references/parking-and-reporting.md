# Parking, cleanup, and reporting

Load this reference when a task cannot finish, when a done task's resources need
releasing, before the teardown check and retrospective, or when writing the
closing report.

Schedule one final audit and retrospective after the required acceptance arms
settle or are explicitly parked. During delivery, update the existing manifest
and handoff on meaningful changes instead of spawning repeated checkpoint tasks.
If the final audit finds residue, use the bounded targeted cleanup and recheck
below; keep the same audit record and append evidence. This never replaces
independent code review, resets budgets, or releases unsettled workers.

## Parking a task

A task that cannot pass its tests, exhausts its review budget with blocking or
undecided findings, or cannot reach green checks after its fix attempts is
reported as `needs-attention`. Preserve everything: the worker terminal, the
worktree, the branch, the findings file, and every receipt. Never force-push,
reset, delete a branch, or continue silently, and never take over the work
yourself to make the number go green.

The same checkpoint applies when another amendment or recovery would exceed
the unit's allowance without recorded continuation authority. A checkpoint never
proves process exit or authorizes stopping a live worker.

A parked task keeps its terminal. Retain it explicitly rather than releasing it,
so the next owner inherits a live session rather than a transcript. A parked
subagent stage keeps its agent id in the ledger; the subagent dies with the
coordinator's session, so name its worktree and uncommitted state in the report.

## Releasing a done task

Release is post-settlement cleanup, never cancellation, and only an accepted
settlement authorizes it. A settled subagent needs no release. After each accepted report, do exactly one of: reuse
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

## Retaining evidence before cleanup

Apply the main guide's evidence-retention rules to the cleanup Task spec before
it runs. A cleanup candidate is not permission to archive all its descendants.

1. List the exact artifacts supporting named results or explicit retention
   requirements, including cited test-result bundles and required binary
   provenance. Measure their total size on the execution host. Keep build and
   dependency caches out of that list; file extensions alone do not qualify.
2. Assign short destinations under `orchestrate/evidence/<unit>/`. Never mirror
   an absolute source path or copy a worktree, its `.orca/` tree, or an entire
   build/cache directory. Check that no source contains its destination before
   copying or moving anything.
3. Record each source, destination, size, supporting result, and content hash
   in a preservation manifest. Verify destination hashes, including bundle
   contents, before any authorized disposal. Existing citations resolve through
   the manifest; preserving their absolute directory structure is unnecessary.
4. If a prior directive requires broad cache retention or preserving absolute
   directory structures, report the conflict and keep the affected candidate
   in place until the retention scope is resolved. Do not silently duplicate it
   or delete required evidence.

Existing retained archives remain in place unless their cleanup is explicitly
authorized. This procedure adds no authority to delete worktrees or scratch.

## Teardown check

Per-task cleanup proves only that the recorded worktrees were removed. Before the
report ships, a **fresh read-only stage agent** — never your own reading — runs these
checks against `worktrees.md` and writes `orchestrate/teardown.md`, each command
with its output, ending in `VERDICT: clean` or `VERDICT: residue`:

| Surface          | Command                                                                                                          | Residue when                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Git worktrees    | `git -C <root> worktree list --porcelain`                                                                        | A run worktree marked `removed`, or one nested under the run that the table never recorded                    |
| Orca worktrees   | `ORCA worktree list --repo id:<repoId> --json`                                                                   | A row for a `removed` worktree, or an unrecorded child of the coordinator's worktree                          |
| Branches         | `git -C <root> branch --list <branch>` per recorded branch                                                       | A `removed` unit's branch still exists                                                                        |
| Live subagents   | The ledger's `subagent:` dispatch cells against the coordinator's agent list                                     | A subagent with no settling notification that the report does not name as stopped                             |
| Worker terminals | `ORCA orchestration worker-list --run <run_id> --terminal-state reclaimable --json`, only when the run has a Run | Any row, or a `counts.release_unknown`/`release_pending` row the report does not name as unresolved ownership |
| Other terminals  | `ORCA terminal list --worktree id:<repoId>::<path> --json` per recorded worktree still present                   | A terminal in a worktree the run no longer owns                                                               |
| Scratch          | The run's scratch and build-cache roots                                                                          | A directory for a released unit                                                                               |
| Primary checkout | The last `primary-<label>.after` against a fresh snapshot                                                        | Any difference                                                                                                |

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

## Known issues

At closing the coordinator writes `<root worktree>/.orca/known-issues.md`: it
adds rows, bumps `seen` and `last-seen`, and removes a row a landed sha fixes,
naming that sha in the closing report. One ignored file per repository (on SSH,
on the execution host; for a folder workspace, at the workspace root), never
committed and never holding secrets. Rows come from `defer` items, every
`nit-skipped` line, logic-changing nits, and flakes seen in the run.

| Field                 | Type     | Nullable | Keys    | Constraints                                      |
| --------------------- | -------- | -------- | ------- | ------------------------------------------------ |
| id                    | `KI-<n>` | no       | primary | stable, never reused                             |
| kind                  | enum     | no       | —       | `flake` \| `pre-existing` \| `nit` \| `deferred` |
| location              | text     | no       | —       | `<file>:<line>` or `test: <name>`                |
| summary               | text     | no       | —       | one line                                         |
| first-seen, last-seen | run slug | no       | —       | `<date>-<slug>`                                  |
| seen                  | int      | no       | —       | ≥1, +1 per run that cites `[KI-<n>]`             |
| source                | text     | no       | —       | `<run>/<unit> R<r>.<n>`                          |

Reviewers read it at the merge step only.

## Retrospective

Every run gets one, whatever its outcome. Before the closing report, run one
stage agent to append this run's entry to
`orchestrate/retrospective.md`, which later `brainstorming` sessions read. It
reads earlier runs' `.orca/*/orchestrate/retrospective.md` first; a repeated
issue cites the earlier file and adds only the new evidence. Record only what
happened — `none` beats padding:

| Section           | Content                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| Orca issues       | Exact command, expected versus actual, enough to file an issue                         |
| Guide friction    | The rule, quoted, that misled or forced a workaround                                   |
| Tiering outcomes  | Per unit: tiers used, rounds needed, escalations and their triggers                    |
| Missed checks     | A lint, test, or CI check that would have caught a fix-round finding before review     |
| Review metrics    | Output of `orca orchestration review-metrics --run <this run> --run <previous v2 run>` |
| Escapes           | `ESCAPE:` lines, or `none` (form below)                                                |
| Tool economy      | Which workers spent context on what, and what they could have been handed instead      |
| Suggested changes | One line each                                                                          |

`## Escapes` lines have the form
`ESCAPE: <unit> - <ci|integration|ab-judge|user> - <file>:<line> - <what> - missed-by: <layer> - fix-at: <guide|lint|known-issues|test|none>`.
Both sections are headed `## Review metrics` and `## Escapes`. On an SSH
execution host without the Orca CLI, `## Review metrics` says exactly
`metrics: unavailable on <host>`.

The worker edits nothing else, commits nothing, and pushes nothing.

## Filing Orca issues

Orca issues and guide friction are fixed in Orca's own repository,
`DoozyX/orca`, where an automation picks up open issues labelled `retro` and
delivers the fix. After the retrospective settles, the same worker files every
`Orca issues` and `Guide friction` entry whose fix belongs in Orca: the CLI and
runtime, orchestration, terminals and agent hooks, or a bundled skill guide. An
entry about the target repository, its CI, or an agent CLI Orca cannot work
around stays in the retrospective only.

Continue the retrospective subagent with the filing instructions through the
launch table's Continue action, or file with a fresh stage agent given the
retrospective's path. A retrospective that ran as an Orca worker cannot be reused
with `worker-start --terminal`; file with a fresh stage agent.

Per entry, search first, then file or comment, never both:

```text
gh issue list -R DoozyX/orca --label retro --state all --search "<key phrase> in:title" --json number,title,state,url
gh issue create -R DoozyX/orca --label retro --title "<area>: <expected vs actual, one line>" --body-file <path>
gh issue comment <number> -R DoozyX/orca --body-file <path>
```

An open match gets a comment with only the new evidence; a closed match is a
regression and gets a new issue citing it. The body carries the exact command,
expected versus actual, `ORCA --version`, the quoted rule for guide friction, and
the retrospective path. Never include secrets, tokens, the target repository's
source, or its private names and URLs beyond what the failure needs. The worker
writes each body under the run's scratch directory, pastes back one
`ISSUE: <url> filed|commented` line per entry, and records the URLs in the
retrospective's `Orca issues` section. A `gh` failure is reported, not retried
around: the entry stays in the retrospective marked `unfiled: <error>`.

## Closing report

Deliver it to the user, one block per task:

```text
## <task title>
- Outcome: done | needs-attention
- PR: <url or "endgame: <what landed>"> - checks: green | failing | none
- Review: <N> review(s), <M> fix(es) counted in budget.md - clean | open items: <list>
- Rework: amendment and recovery attempts and continuation decisions
- Models: <stage tier/model/via=subagent|worker per dispatch> - escalations: <none | what and why>
- Evidence: <the command output that settled it>
- Screenshots: <orchestrate/<unit>/ capture paths> (UI units only)
- Blind A/B: <AB_SUMMARY line> (when the judge ran)
- Deferred: <items recorded and not fixed, or omit>
- Needs attention: <what is left and where it is preserved, or omit>
```

Close by naming what was released, what was deliberately preserved, the
teardown verdict, the retrospective path, and each filed Orca issue's URL. Screenshots are named only here,
never in a PR, MR, or commit. For a
verification entrance, the report instead carries the deployed identity, the arm
evidence, the adjudications, and exactly one of `pass`, `defect`, `inconclusive`.

Do not end the coordinator turn while any terminal still owes an ownership
decision, or while any task has no explicit outcome.
