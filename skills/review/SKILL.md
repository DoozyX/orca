---
name: review
description: >-
  Multi-layer code review of a diff, a branch, or a pull request: an adversarial
  pass starved of the author's intent, a mechanical edge-case path trace, and a
  verification-gap check, plus a deletion check when code was removed and a
  reuse check when a named unit or a dependency was added or the change is
  called a fix, merged into one deduplicated, severity-graded, triaged findings
  list ending in a machine-readable verdict. Use when the user asks to review
  changes, wants a second opinion before committing or merging, or when a
  dispatched reviewer is told to run the shared review layers. This is not a
  debugging skill and not an evidence gate: use `debug` when something is
  already misbehaving, `tdd` when the gap is a missing test, and `verify` to
  back a completion claim.
---

# Orca Review

This file is a discovery stub, not the usage guide. The full, version-matched Orca
review reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage this skill when the user asks to review changes, a diff, a branch, or a pull request,
wants a second opinion before committing or merging, or when a dispatched reviewer is told
to run the shared review layers. It runs an adversarial pass starved of the author's intent,
a mechanical edge-case path trace, and a verification-gap check — plus a deletion check when
code was removed — and merges them into one deduplicated, severity-graded, triaged findings
list ending in a machine-readable verdict. Review is read-only. Use the `debug` skill when
something is already misbehaving, `tdd` when the gap is a missing test, and `verify` to back
a completion claim.

## Resolve the CLI for this session

The executable is `orca`. Do not probe environment variables or `which` for alternatives.

Below, `ORCA` is a placeholder for `orca`. Substitute it before running anything; do not
create a shell variable or run `ORCA` literally.

If `orca` cannot run, report its exact error and stop.

## Load the version-matched guide before running any layer

```text
ORCA skills get review
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers target resolution, layer scoping, merging, and the verdict. Each
layer is a conditional action gate: load only the one you are about to run with
`ORCA skills get review --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get review --full` and read the named bundled reference before acting.

Run `skills get` as shown, without `--json`: `--json` packs the guide into one escaped line.
If your tool cuts the middle out of the guide, read only the missing line range rather than
loading the whole guide again. Prefer `--json` for other commands. Use the selected
executable's `--help` for commands or flags the guide does not cover. A
`runtime_unavailable` error is usually transient while Orca is busy or restarting: wait a
few seconds and retry the command. Before retrying a command that changes something, check
whether it already took effect, and reuse any request ID the error names. `ORCA open` can
bring Orca's window to the front over the user's work, so never run it to retry a failed
command. Run it only when the user asks, or when Orca is really not running:
`ORCA status --json` reports `result.app.running: false` and no `result.app.restarting`, or every command, `ORCA status`
included, still cannot connect after about 30 seconds of retries. If a command fails with
`runtime_access_denied`, your sandbox blocked the connection: re-run it with escalated
permissions, and do not run `ORCA open` or restart Orca. If `skills get` is unknown, explain
that updating Orca restores the guide; use `--help` for read-only discovery and do not guess
unsupported commands.
