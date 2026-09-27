# Coordinator loop

Load this reference for expanded DAG waves, per-invocation launch preferences,
same-terminal reuse, or review ownership. The compact guide remains the source
of truth for the loop order and completion boundary.

## Ready waves

Create independent Tasks before the first wait. Encode only real dependencies,
then use the ready view as external memory:

```text
ORCA orchestration task-create --spec "<dependent work>" --deps <json_array> --json
ORCA orchestration task-list --ready --brief --json
```

`--brief` collapses whitespace and caps echoed specs at 160 characters;
`spec_truncated` identifies shortened rows. Omit it when full specs are needed or
when an older CLI rejects the flag. A nested worker must respect
`nested_worker_depth_exceeded`; creating another Run does not reset depth.

## Launch preferences

For a fresh Claude, Codex, Cursor, Antigravity, or Muse terminal, `--model`
accepts an opaque provider model ID. Pass it only when the user named a model;
otherwise omit it so the worker inherits the user's configured agent default.
Add `--effort` only when that model supports it:

```text
ORCA orchestration worker-start --task <task_id> --worktree current --agent claude --model opus --effort high --json
ORCA orchestration worker-start --task <task_id> --worktree current --agent muse --model muse-spark-1.3 --json
```

Other agents, including `opencode`, reject `--model`; they run the model set in
their own config, so a coordinator wanting a same-model opencode worker relies
on that config.

`--effort` requires `--model`; neither option combines with `--terminal`. A
connected worker server must advertise launch-preference support before Orca
forwards either field. Compare `launch.requested` with `launch.effective`; never
claim a model or effort from requested arguments alone.

### Engine roles

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
Antigravity, and Muse. `effort` requires a model in the same candidate or
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
7. Compare `launch.effective` with the requested agent, model, and effort before
   reporting what actually started.

## Reuse after settlement

Choose the terminal's next owner before acknowledging the Delivery. When the
same exact agent has immediate follow-up work, recover the proven handle and
transfer cleanup ownership to the new Dispatch:

```text
ORCA orchestration worker-show --dispatch <dispatch_id> --json
ORCA orchestration worker-start --task <next_task_id> --terminal <agent_terminal_handle> --json
```

Otherwise explicitly retain or release the settled worker. Do not leave it live
only to inspect output; archived output remains available through `worker-read`.

## Review ownership

A review-only `worker_done` authorizes synthesis of findings, not coordinator
file edits. Dispatch or hand off fixes unless the user explicitly assigned them
to the coordinator. If the user's plan names a next owner, post-review fixes and
PR preparation remain with that owner; the coordinator routes and synthesizes.
