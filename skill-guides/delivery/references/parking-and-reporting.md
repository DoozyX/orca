# Parking, cleanup, and reporting

Load this reference when a task cannot finish, when a done task's resources need
releasing, or when writing the closing report.

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

Then prove the run left nothing behind before the report ships: no terminal still
carrying this run's name, no worktree under the workspace's worktree directory
with this run's prefix that the recorded list did not know about, and no orphaned
run scratch directory. Residue goes to a cleanup worker as a list, never to your
own hands; then re-check. Ship the report on a clean check, or state the leftovers
in the report as open items. A parked run's residue is the point — name it as
retained rather than sweeping it.

## Closing report

Deliver it to the user, one block per task:

```text
## <task title>
- Outcome: done | needs-attention
- PR: <url or "endgame: <what landed>"> - checks: green | failing | none
- Review: <N> round(s) completed of the budget - clean | open items: <list>
- Evidence: <the command output that settled it>
- Deferred: <items recorded and not fixed, or omit>
- Needs attention: <what is left and where it is preserved, or omit>
```

Close by naming what was released and what was deliberately preserved. For a
verification entrance, the report instead carries the deployed identity, the arm
evidence, the adjudications, and exactly one of `pass`, `defect`, `inconclusive`.

Do not end the coordinator turn while any terminal still owes an ownership
decision, or while any task has no explicit outcome.
