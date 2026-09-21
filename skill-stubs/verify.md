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

<!-- shared: resolver -->

## Load the version-matched guide before making any completion claim

```text
ORCA skills get verify
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained: this topic has no conditional references, so read it
and gather the evidence it names. If that binary does not recognize the topic, say so rather
than guessing at what counts as evidence.

<!-- shared: no-guessing -->
