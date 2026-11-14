# Coordinator loop

## Change-driven observation

Let Orca's wake drive observation. When you must block instead, keep one
consuming inbox and one pending `check --wait`, observed until it returns; never
repeat immediate checks. Batch independent reads and use existing brief task
views and worker projections for routine status. Keep full receipts in session
scratch and print the decision-relevant identities, verdicts, required actions
and evidence paths.

Process every message in a Delivery; never truncate or filter a Delivery to meet
a size target. A projection is a view, not another status store, and never
substitutes for current execution-host evidence at a decision boundary. Follow
every page when a fleet enumeration is required.

Update the manifest and current handoff only when phase, owner, revision,
blocker, authority or accepted outcome changes. An unchanged live observation or
empty wait alone does not warrant a document rewrite. A timeout never proves
exit or authorizes stopping, retrying or replacing a worker.

Use bounded infrastructure recovery: diagnose the first failed boundary, reserve
an attempt in the delivery unit's existing recovery ledger, and run one scoped
repair with a deadline and a falsifiable check. Preserve failed evidence; after
the allowance is exhausted use recorded continuation authority or park the
blocked arm. Already-authorized recovery does not need another confirmation.
There is no universal waiver for budgets, authority, or custody.
The coordinator queues checks that conflict over shared resources rather than
launching duplicate suites or stopping another owner's process.

Fleet waiting is a pending question or approval, separate from agent liveness.
Read attention categories and available host-computed diagnostics: state age
is time in the same state, checkpoint age dates artifact/report/ack evidence,
and blocker age dates the oldest still-pending question or gate. Spinner output
proves neither progress nor a reset of these clocks. Missing optional
diagnostics from older hosts remain unknown; never turn remote absence into exit
or compare wall clocks from different hosts.

## Task DAGs

A Task needs a Run, so create one first. Workers editing the same files at once
need separate workspaces.

```text
ORCA orchestration run-create --objective "<goal>" --from <coordinator_handle>
ORCA orchestration task-create --spec "<dependent work>" --deps <json_array>
ORCA orchestration task-list --ready --brief
ORCA orchestration worker-start --task <task_id> --worktree current --agent <agent> --from <coordinator_handle>
```

On every wake, start the Tasks `task-list --ready` shows.

## Several Runs

A later `run-create` keeps your earlier Runs: their mail still wakes you, but
commands without `--run` use the newest Run, so pass `--run <id>` for an earlier
one. `run-use` keeps only the Run it names.

## Engine roles

Before the first dispatch whose agent the user did not name, read the optional
`~/.orca/agent-roles.json` and the root worktree's `.orca/agent-roles.json` (a
folder workspace uses that folder's `.orca/`), on the execution host that
launches workers. The repo file replaces the global file per top-level key, and
inside `roles` per role.

```json
{
  "roles": {
    "implementer": [{ "agent": "claude" }],
    "reviewer": [
      { "agent": "codex", "model": "gpt-5.5", "strong": { "model": "gpt-5.5", "effort": "high" } },
      { "agent": "claude" }
    ],
    "inspector": [{ "agent": "omp" }]
  },
  "crossEngineReview": true
}
```

The top level permits `roles` and `crossEngineReview` (boolean). `roles` permits
`planner`, `implementer`, `ui`, `reviewer` and `inspector`, each a non-empty
ordered list. A candidate has a required `agent` accepted by
`worker-start --agent`, optional `model` and `effort` (`effort` needs a `model`),
and an optional `strong` override with the same two keys. On invalid JSON, an
unknown key, or an empty list, stop before the first dispatch and report
`engine-roles invalid: <file>: <problem>`.

For each dispatch:

1. Take the role's first candidate that is not marked `unavailable` for this
   run. For `reviewer` with `crossEngineReview: true`, prefer the first candidate
   whose agent differs from the producer's; if none can start, use the producer's
   and record `same-engine-review`.
2. Pass `--agent`, plus the candidate's `--model` and `--effort` when present,
   or its `strong` override for a strong dispatch.
3. When a worker fails to start, or stops on a usage limit, mark that agent
   `unavailable` for the run and take the next candidate. With none left, the
   unit is `needs-attention` with each reason named.
4. Record role, agent and effective model (`launch.effective` in
   `worker-show --full`) in the manifest.

With neither file, or no entry for the role, use the coordinator's own agent
with no `--model`.

## Reusing a worker

To give a finished worker follow-up work, create the Task, then start it on the
`terminal` and `workspace` from that worker's `worker-start` receipt or
`worker-list` row:

```text
ORCA orchestration task-create --spec "<follow-up>"
ORCA orchestration worker-start --task <task_id> --terminal <agent_terminal_handle> --worktree <its_workspace> --from <coordinator_handle>
```

A structured worker (a `structworker_` handle) has no terminal, so
`worker-start --terminal` refuses it with `terminal_unsupported_for_agent_session`.
To give that session the next Task, create a context-only Dispatch and send its
preamble yourself:

```text
ORCA orchestration dispatch --task <next_task_id> --to <structworker_handle> --from <coordinator_handle> --return-preamble --json
ORCA orchestration send --to <structworker_handle> --from <coordinator_handle> --subject "<task title>" --body "<preamble>"
```

That reuse is unsupervised: no readiness wait, input receipt, or turn
observation backs it, so start a fresh worker when supervision matters.
`worker-stop --dispatch <dispatch_id>` on that Dispatch fences it and interrupts
the session's running turn; its `interrupt` field says whether it did.
