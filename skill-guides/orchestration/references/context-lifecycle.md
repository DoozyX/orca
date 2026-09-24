# Coordinator context lifecycle

Load this reference when a coordinator expects to supervise more work than one
context window holds, after its context was compacted, or when it must hand the
run to a successor.

## The invariant

Your context grows with decisions taken, never with time elapsed. The run
directory is the run's state; your context is a cache of it. A coordinator that
supervised four idle hours should have paid almost nothing for them.

## The run directory

Everything durable lives beside the design, in the workspace-local ignored
directory `brainstorming` already creates:

```text
.orca/<date>-<slug>/
  design/
    goal.md      the user's ask, verbatim; written once, appended to, never rewritten
    design.md    the approved design, when one exists
  plan/          per-unit plans, one folder per unit
  orchestrate/
    manifest.md  what has been decided and landed, updated as work completes
    handoff.md   live tasks and their stage, open questions, anything in flight
    …            prompts, worktree tables, poll state, logs
```

One directory per initiative, phase-nested. Everything for one run stays
together and each phase keeps its own folder, so a successor reads
`orchestrate/handoff.md` without sifting through design material.

Create it with the recipe in `brainstorming`'s `references/design-file.md`,
including the `git check-ignore` probe, so it degrades to a plain folder
workspace and never requires Git. A run that started without a brainstorm
creates the same directory under a slug of its own.

`manifest.md` is append-mostly and records outcomes. `handoff.md` is a live
replacement, rewritten in full each time, and holds only what a successor needs
to keep going.

## The run directory holds decisions, not outputs

Build products, dependency checkouts, and caches never go inside the run
directory. Point the tool's own output flag at a scratch root instead, reuse one
path across a task's rounds rather than one per round, and copy only the
artifact that proves the result — a result bundle, a failing log excerpt — back
into the run.

Measured cost of ignoring this: one orchestrated iOS run left 70 GB of Xcode
DerivedData inside its run directory, one full tree per task and another per
review round, against 23k markdown files of actual run state. The per-repository
rule belongs in that repository's own skill; this is the general form.

## Three rules

1. **Observe by change, never by dump.** Never load a raw `check --json` or
   `worker-list --json` dump into coordinator context when a projected status
   line answers the question. A dump is the single largest avoidable cost in a
   long run.
2. **Flush at every task completion.** Write the outcome into `manifest.md` and
   bring `handoff.md` up to date in the same turn the task settles. State that
   only exists in your context is state you will lose.
3. **Delegate reads.** A worker that reads ten files and reports one conclusion
   costs you the conclusion. Reading them yourself costs you the files.

## Compaction

The agent compacts its own context automatically; do not measure tokens or
rotate on a threshold. Flushing at every task completion is what makes that
safe: a compaction summarizes your context, never the run directory. After any
compaction, run the recovery steps below on yourself before the next decision.

## Handing the run to a successor

Hand off only when the user asks, or when this session must end while the run
is live. A handoff hands ownership to a successor coordinator and ends your run. Use the
`orca-cli` full-handoff flow — worktree or terminal create, `terminal wait` for
readiness, then send the prompt — and stop once the send reports
`accepted: true`. Open no Run for it, create no Task, and do not supervise your
own successor.

**Reparent the live children before you send the prompt.** Worker worktrees you
created are your children in Orca's lineage, and a successor that does not own
them reads a tree whose live work hangs under a coordinator that has stopped.
For each worktree still in flight, move it across:

```text
ORCA worktree set --worktree id:<repoId>::<childPath> \
  --parent-worktree id:<repoId>::<successorPath> --json
```

Order matters: successor exists and is ready, then reparent, then send. A
handoff interrupted midway leaves some children moved and some not, which the
successor's reconciliation step below catches — a partial move is recoverable, a
prompt sent to a coordinator that owns nothing is not.

Refuse to hand off while `goal.md` or `handoff.md` is missing or empty. A
handoff into an empty `handoff.md` produces a successor that confidently
invents the run's state; this has been observed in practice.

The successor's prompt carries the absolute path of the run directory, the
absolute path of the skill it must load, and nothing else that a file already
holds.

## Recovery after compaction or handoff

A compacted coordinator or a successor starts from files, not from a summary.

1. Read `goal.md` first, verbatim. It is the only record of the user's own
   words, and it outranks any later restatement.
2. Read `manifest.md` for what has landed, then `handoff.md` for what is live.
3. Reconcile `handoff.md` against the runtime before acting on it: a
   predecessor's self-written handoff is a claim, not a record. `worker-list`
   and the branch diff are the record. Check lineage in the same pass — a live
   worktree still parented to the predecessor means a handoff was
   interrupted; reparent it to yourself with `worktree set` and carry on.
4. Only then take a new decision.
