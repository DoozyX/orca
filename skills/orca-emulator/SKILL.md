---
name: orca-emulator
description: >-
  iOS Simulator control from inside Orca, with the live device view in Orca's
  emulator pane. Use when driving a booted Apple Simulator on macOS: taps,
  gestures, typing, hardware buttons, rotation, and the accessibility tree, or
  when an iOS change needs simulator evidence. For an Android device or emulator
  use the Android emulator skill; build and install the app with xcodebuild or
  simctl first.
license: Apache-2.0
---

# Orca Emulator

This discovery stub loads the version-matched guide from the Orca executable used for this session.

Prefer Orca over raw `serve-sim` or direct `simctl` for simulator control inside Orca; it
handles device scoping, helper lifecycle, and worktree context.

## Resolve the CLI for this session

The executable is `orca`. Do not probe environment variables or `which` for alternatives.

Below, `ORCA` is a placeholder for `orca`. Substitute it before running anything; do not
create a shell variable or run `ORCA` literally.

If `orca` cannot run, report its exact error and stop.

## Load the version-matched guide before running Orca commands

```text
ORCA skills get orca-emulator
```

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
