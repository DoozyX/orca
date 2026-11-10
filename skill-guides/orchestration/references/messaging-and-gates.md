# Messaging and gates

Handle a whole `check` batch before the next `check`.

Groups (`@all`, `@idle`, `@codex`, ...) reach the live workers of your Run;
`@worktree:<id>` also reaches coordinators in that workspace. Use groups only
for deliberate fan-out.

`--types` with `--wait` is both the wake condition and the delivery filter: a
newly built Delivery holds only rows of those types, and other unread rows stay
unread for a check without `--types`. Exception: an unhandled Delivery left by
an older Orca that already holds a row of those types replays whole, rows of
other types included. Without `--wait`, `--types` has no effect on consuming
checks. A consuming check marks the batch it returns as handled, so no `--ack`
is needed; waiting reserves nothing, and listeners with the same `--types` woken
by the same arrival get the same Delivery.

Inside the coordinator's own Orca terminal `--from` may be omitted, because
`ORCA_TERMINAL_HANDLE` names it; a dispatched worker instead copies the exact
`--from` and other arguments in its preamble. `check` is the exception: it
identifies its caller with `--terminal`, never `--from`.

`run-create` binds the terminal named by `--from` or `ORCA_TERMINAL_HANDLE`; it
never guesses. `run-use`, `dispatch` and `worker-start` resolve their caller the
same way; when neither names one they refuse with `no_active_sender_terminal`,
so pass `--from <coordinator_handle>`. When `worker-start` refuses with
`consumer_fenced`, the message names the Task Run's bound coordinator and the
`run-use --id <run_id> --from <coordinator_handle>` that rebinds it to you.

A send to a structured worker can report `delivery`: `injected` means the
pointer started a turn, and `queued` means the worker's chat holds the pointer
and sends it when the current turn ends, so the running turn does not see it.
Put a scope change for a running worker in a new Task or a stop-and-relaunch
instead. A send without `delivery` claims nothing about when the worker sees it.

To reach an agent on a paired server, use `send --on <server>`; a reply to mail
from another server needs no flag. See
[Placement and remote execution](placement-and-remote.md).
