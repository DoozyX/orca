# Reuse layer

Load this reference when the change adds a named unit or dependency, or is a fix.

You are checking two things: does new code rebuild something that already exists,
and does a fix leave the same defect somewhere else.

## When this layer runs

When the diff adds a named unit (function, class, component, hook, module, file)
or a dependency, or when the commit subjects or the Task spec call the change a
fix. Skip it otherwise.

## Inputs

The diff, the full post-change content of every touched file, and read access to
the rest of the workspace.

## Procedure

### Search A: duplication

For each new unit or dependency, search for something that already does the job:

1. The repository: name variants, distinctive literals, and the key terms of the
   job.
2. The installed dependencies.
3. The platform or standard library.

### Search B: partial fix

For each function body a fix changes:

1. List its callers.
2. Grep sibling copies of the changed logic (the same condition or literal).
3. Flag a sibling that still holds the defect, or a fix made in a caller while
   the shared callee keeps it.

## Demonstration gate

Every finding names the existing `path:line` or API with one line of evidence it
does the same job, or names the sibling `path:line` and an input that still
breaks there. If it cannot, drop the finding.

## Output

A numbered list:

```text
N. <file>:<line> - <new unit or fixed logic> - duplicates|leaves broken <existing path:line or API> - <evidence>
```

## An empty result is valid

If nothing qualifies, say exactly `No reuse findings.` Do not invent a finding.

## Severity ban

Do not assign severity, rank findings, or give style or design opinions beyond
duplication. Severity is decided at merge.
