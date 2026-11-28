<!-- Single-authored blocks shared by every skill stub. -->

<!-- block: resolver -->

## Resolve the CLI for this session

The executable is `orca`. Do not probe environment variables or `which` for alternatives.

Below, `ORCA` is a placeholder for `orca`. Substitute it before running anything; do not
create a shell variable or run `ORCA` literally.

If `orca` cannot run, report its exact error and stop.

<!-- block: no-guessing -->

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
