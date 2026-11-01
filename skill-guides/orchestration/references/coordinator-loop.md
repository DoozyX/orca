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
Use Orca resource leases only for simulators. Before using a shared simulator,
take `ORCA orchestration lease acquire --resource ios-sim-<udid prefix>`, treat
`queued` as wait, and release it after the last simulator job exits. Do not
acquire or queue Orca leases for CPU, builds, validation suites, ports, or
databases; isolate their mutable state and coordinate actual conflicts directly.

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
ORCA orchestration worker-start --task <task_id> --worktree current --agent codex --from <coordinator_handle>
```

On every wake, start the Tasks `task-list --ready` shows.

## Several Runs

A later `run-create` keeps your earlier Runs: their mail still wakes you, but
commands without `--run` use the newest Run, so pass `--run <id>` for an earlier
one. `run-use` keeps only the Run it names.

## Engine roles

Before the first dispatch whose agent the user did not name, read the optional
host-local `~/.orca/agent-roles.json` and the root worktree's
`.orca/agent-roles.json`. In a folder workspace, use that folder's `.orca/`
instead. Resolve both on the execution host that launches workers, including
SSH and WSL; never substitute the client filesystem. In POSIX shells, use
`$HOME/.orca/agent-roles.json` and `<root>/.orca/agent-roles.json`; in
PowerShell, use `$env:USERPROFILE\.orca\agent-roles.json` and
`Join-Path <root> '.orca/agent-roles.json'`. Read only files that exist, for
example `test -f "$HOME/.orca/agent-roles.json" && cat "$HOME/.orca/agent-roles.json"`
or `Test-Path $env:USERPROFILE\.orca\agent-roles.json` followed by
`Get-Content -Raw $env:USERPROFILE\.orca\agent-roles.json`.

Both absent means `engine-roles=none`: use today's explicit/user/default agent
choice without a quota gate. An absent role after merging likewise uses the
coordinator's own agent with no `--model`, recorded as
`role=<r> source=default`.

The JSON object permits only `roles`, `crossEngineReview`, and `quota`.
`roles` permits only `planner`, `implementer`, `ui`, `reviewer`, and `inspector`;
each present role is a non-empty ordered list of candidates. A candidate has a
required `agent` accepted by `worker-start --agent`, optional `model` and
`effort`, and optional `strong: { "model": "...", "effort": "..." }` for a strong
dispatch tier. `model` is supported only for Claude, Codex, Cursor,
Antigravity, Grok, and Muse. `effort` requires a model in the same candidate or
strong override. For example:

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
  "crossEngineReview": true,
  "quota": { "skipAbovePercent": 90 }
}
```

Merge the repo file over the global file per top-level key, and inside `roles`
replace per role key; each list replaces the whole global list. After merging,
`crossEngineReview` must be boolean and `quota.skipAbovePercent` an integer
from 1 through 100. Reject invalid JSON, unknown keys at any level, empty role
lists, missing required keys, unsupported model overrides, and `effort` without
`model`. Before the first dispatch, stop the run on any such error and report
`engine-roles invalid: <file>: <problem>`. Never silently ignore a bad file.

For each configured-role dispatch, run
`orca account list --refresh-usage --json` immediately before launching. A
candidate has usable quota only if
`result.rateLimits.<agent>` exists, has `status: "ok"`, and has a counted
window; a missing or non-`ok` entry is `no-quota-data` and never eligible.
Count every non-null `session`, `daily`, `weekly`, and `monthly` window. Count
model-specific windows such as Claude's `fableWeekly` only when the selected
model belongs to that family. A candidate is over quota when any counted
window has `usedPercent >= skipAbovePercent`.

Select in this order for every dispatch:

1. Start with the role's ordered list, minus agents marked `unavailable` for
   this run. For `reviewer` and `crossEngineReview: true`, move agents different
   from the producer's agent first, preserving relative order in both groups.
2. Take the first candidate with usable quota under the threshold. Pass
   `--agent <selected>`, plus that candidate's `--model` and `--effort` when
   present; use its `strong` override for a strong tier. Omit absent flags.
3. Record the role, source files, agent, effective model, each counted window,
   maximum used percentage, reset time, and the `no-quota-data` reason for
   skipped candidates in the manifest and next status message.
4. If a reviewer shares the producer's agent under `crossEngineReview`, record
   `same-engine-review` and say so in the next status message.
5. With no pick and at least one over-quota candidate with a known reset,
   return `quota@<earliest resetsAt among over-quota candidates>` and park only
   that unit. With no known reset, or when every candidate is `no-quota-data`
   or `unavailable`, return `needs-attention` and name every reason.
6. On `startup-failed` with a receipt proving no agent started, mark that agent
   `unavailable` for this run and re-run selection on the next eligible
   candidate. After a worker's quota stop, re-run selection when the unit
   resumes; other units continue.
7. Compare `launch.effective` (`worker-show --full`) with the requested agent,
   model, and effort before reporting what actually started.

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
