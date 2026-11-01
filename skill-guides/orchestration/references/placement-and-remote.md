# Placement and remote execution

Folder workspaces are valid. `new-child` and `new-top-level` make Git worktrees
and do not apply to folders; never `git init` a user's folder.

When a local worker does need its own worktree, `new-child` is the form to use:
it keeps the worker in the coordinator's project, nested under the coordinator's
worktree, so one run stays one tree. `new-top-level` is for work that genuinely
belongs to no run — and for remote placement, where `new-child` is invalid.

```text
# Child of the current worktree.
ORCA orchestration worker-start --task <task_id> --worktree new-child --agent codex --setup run --from <coordinator_handle>

# On a connected server; the Run stays on yours.
ORCA orchestration worker-start --task <task_id> --on <environment> --worktree new-top-level --repo <exact_remote_repo_selector> --name <name> --agent codex --setup run --from <coordinator_handle>
```

`--name` is optional: without it Orca picks a name as it does for an unnamed
workspace, and the start output names the workspace it created.

After start, address a remote worker only by Dispatch ID, never by a terminal
handle.
