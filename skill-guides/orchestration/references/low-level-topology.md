# Low-level topology

Load this reference only when `worker-start` cannot express required custom argv
or terminal topology. It is not the normal supervised loop and is never a full
handoff recipe.

Readiness timeouts and quota limits are not expressiveness gaps. Never replace
an interactive worker with `codex exec`, a redirected batch script, or a detached
process to bypass startup readiness. Inspect the retained startup evidence and
follow `references/recovery-and-cleanup.md`; fix the readiness defect or retry
an available provider through `worker-start` after the prior attempt is settled.
Keep worker progress visible in its Orca terminal.

```text
ORCA terminal create --worktree active --title <task_name> --command "<agent_command>" --json
ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration dispatch --task <task_id> --to <handle> --inject --json
```

Wait for readiness only when startup could lose injected input. Prefer
agent-first `worker-start` whenever its argv and topology are sufficient.

`dispatch --inject` creates authoritative Task/Dispatch context but deliberately
keeps an operator-created process unsupervised: it creates no supervised worker
resource row. `worker-show`, `worker-read`, and `worker-list` report the lane as
`unsupervised`; `worker-stop` and `worker-abandon` do not close that process, and
settled retain/release take no process action.

Use `worker-start --terminal <handle>` when lifecycle ownership of an existing
agent terminal is required. Never imply that low-level dispatch retroactively
owns a process, never use it to route around the nested-depth limit, and never
use it for an ownership handoff.
