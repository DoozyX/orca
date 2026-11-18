---
name: verify
description: >-
  The evidence gate before any completion claim: every "it works", "tests pass",
  "fixed", or "done" must be backed by a command run in the same message with its
  output shown, checked against the request as it was actually stated rather than
  as you remember it. Use before committing, opening a pull request, reporting a
  task complete, or telling anyone something is working. This is not a testing
  skill and not a review skill: use `tdd` to write the tests, `review` to look
  for defects, and `debug` to find a cause when the evidence comes back red.
---

# Orca Verify

This file is a discovery stub, not the usage guide. The full, version-matched Orca
verification reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage this skill before committing, opening a pull request, reporting a task complete, or
telling anyone that something works. It is the evidence gate: every "it works", "tests
pass", "fixed", or "done" must be backed by a command run in the same message with its
output shown, and checked against the request as it was actually stated rather than as you
remember it. Use the `tdd` skill to write a missing test, `debug` when the evidence comes
back red and the cause is unknown, and `review` when the question is whether the change is
correct rather than whether it ran.

## Resolve the CLI for this session

The executable is `orca`. Do not probe environment variables or `which` for alternatives.

Below, `ORCA` is a placeholder for `orca`. Substitute it before running anything; do not
create a shell variable or run `ORCA` literally.

If `orca` cannot run, report its exact error and stop.

## Load the version-matched guide before making any completion claim

```text
ORCA skills get verify
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained: this topic has no conditional references, so read it
and gather the evidence it names. If that binary does not recognize the topic, say so rather
than guessing at what counts as evidence.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. A `runtime_unavailable` error is usually transient while Orca is busy or
restarting: wait a few seconds and retry the command. Before retrying a command that changes
something, check whether it already took effect, and reuse any request ID the error names.
`ORCA open` can bring Orca's window to the front over the user's work, so never run it to
retry a failed command. Run it only when the user asks, or when Orca is really not running:
`ORCA status --json` reports `result.app.running: false`, or every command, `ORCA status`
included, still cannot connect after about 30 seconds of retries. If a command fails with
`runtime_access_denied`, your sandbox blocked the connection: re-run it with escalated
permissions, and do not run `ORCA open` or restart Orca. If `skills get` is unknown, explain
that updating Orca restores the guide; use `--help` for read-only discovery and do not guess
unsupported commands.
