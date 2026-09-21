# Orca Debug

This file is a discovery stub, not the usage guide. The full, version-matched Orca
debugging reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage debugging as soon as a bug, a failing test, or any unexpected behavior appears, and
before proposing or applying any fix. It runs investigation before repair: read the real
error, reproduce it, find the first boundary where the value is already wrong, compare
against a working case, and test one falsifiable hypothesis at a time — with a hard stop
after three failed fixes to question the architecture instead of attempting a fourth. Use
the `review` skill when the question is what else is wrong in a change that is not
misbehaving, `tdd` to write the reproduction test, and `verify` to back the claim that the
bug is fixed.

<!-- shared: resolver -->

## Load the version-matched guide before applying any fix

```text
ORCA skills get debug
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained: this topic has no conditional references, so read it
and work the phases in order. If that binary does not recognize the topic, say so rather
than guessing at the investigation order.

<!-- shared: no-guessing -->
