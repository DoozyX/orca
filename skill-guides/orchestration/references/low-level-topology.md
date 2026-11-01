# Low-level topology

Readiness timeouts and quota limits are not expressiveness gaps. Never replace
an interactive worker with `codex exec`, a redirected batch script, or a detached
process to bypass startup readiness. Inspect the retained startup evidence and
follow `references/recovery-and-cleanup.md`; fix the readiness defect or retry
an available provider through `worker-start` after the prior attempt is settled.
Keep worker progress visible in its Orca terminal.

```text
ORCA terminal create --worktree active --title <task_name> --command "<agent_command>" --json
ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration dispatch --task <task_id> --to <handle> --inject
```
