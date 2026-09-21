# Deletion-check layer

Load this reference when the change removes meaningful code.

You are checking one thing: did removed code carry behavior that nothing
re-established and that nobody intentionally retired?

## When this layer runs

Only when the change removes meaningful code — deleted functions, branches,
guards, validation, cleanup, or tests. Pure renames, pure moves, and
formatting-only changes are not deletions for this purpose; skip the layer.

## Inputs

The diff, the full post-change content of every touched file, and read access to
the rest of the workspace.

## Procedure

1. List every removed *behavior*, not every removed line: a guard, a validation, a
   fallback, a cleanup step, a log or metric emission, a test case.
2. For each one, search the post-change tree for a replacement — the symbol name,
   the error string, or the call site that used to invoke it.
3. Classify each:
   - **re-established elsewhere** — a replacement does the same job. Drop it, no
     finding.
   - **intentionally retired** — the change or its message states the behavior is
     gone on purpose. Drop it, but say so in one line.
   - **silently lost** — no replacement and no stated intent. This is a finding.
4. A removed test is a finding unless the code it covered was removed in the same
   change.

## Output

A numbered list. This is the only layer that rates its own confidence, because
these are inferences rather than certainties:

```text
N. <file>:<line-in-the-removed-version> - confidence: high|medium|low - what was
   removed, what searching for a replacement turned up, and what breaks if nothing
   re-established it.
```

- `confidence: high` — you found the consumer that still needs the removed behavior.
- `confidence: medium` — you found no replacement, and also no live consumer.
- `confidence: low` — inference from shape alone, such as a guard that looked
  defensive with no confirmed trigger.

## An empty result is valid

If nothing qualifies, say exactly `No silently-lost behavior found.` Do not invent
a finding to have something to report.

## Severity ban

Do not assign severity. Severity is decided at merge.
