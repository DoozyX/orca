# Coordinator context lifecycle

Load this reference when a coordinator expects to supervise more work than one
context window holds, or when it notices its own context is large.

## The invariant

Your context grows with decisions taken, never with time elapsed. The run
directory is the run's state; your context is a cache of it. A coordinator that
supervised four idle hours should have paid almost nothing for them.

## The run directory

Everything durable lives beside the design, in the workspace-local ignored
directory `brainstorming` already creates:

```text
.orca/design/<date>-<slug>/
  goal.md      the user's ask, verbatim; written once, appended to, never rewritten
  design.md    the approved design, when one exists
  manifest.md  what has been decided and landed, updated as work completes
  handoff.md   live tasks and their stage, open questions, anything in flight
```

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

## Four rules

1. **Observe by change, never by dump.** Never load a raw `check --json` or
   `worker-list --json` dump into coordinator context when a projected status
   line answers the question. A dump is the single largest avoidable cost in a
   long run.
2. **Flush at every task completion.** Write the outcome into `manifest.md` and
   bring `handoff.md` up to date in the same turn the task settles. State that
   only exists in your context is state you will lose.
3. **Delegate reads.** A worker that reads ten files and reports one conclusion
   costs you the conclusion. Reading them yourself costs you the files.
4. **Rotate before you are forced to.** A deliberate handoff at a threshold you
   chose beats a lossy auto-compaction of your own half-finished work.

## Thresholds

Read your own context size; do not guess it, and do not treat the 1M window as a
budget to spend. A Claude coordinator's live total is the last assistant `usage`
record in its own session transcript, under
`~/.claude/projects/<cwd-path-with-slashes-as-dashes>/<session-id>.jsonl`:

```text
tail -c 200000 "$(ls -t ~/.claude/projects/<slug>/*.jsonl | head -1)" \
  | grep -o '"usage":{[^}]*}' | tail -1
```

Used context is `input_tokens` + `cache_read_input_tokens` +
`cache_creation_input_tokens`; `output_tokens` is already inside the next turn's
input. `ls -t` picks the newest transcript in that directory, which is yours only
if no other session shares your cwd — confirm by grepping the file for a
distinctive string from one of your own recent turns before trusting the number.

- **Every task completion:** flush (rule 2), then read the number.
- **At or above 200k:** flush everything still unwritten and treat the run
  directory as authoritative from here.
- **At or above 250k:** rotate, before starting another task.

Rotating at 250k rather than at the window's edge is the whole point: a
coordinator that fills 1M loses proportionally more when it is finally forced to
compact, and its successor inherits a summary instead of files.

When the reading is unavailable — a non-Claude coordinator, no readable
transcript, an agent whose usage Orca does not publish — fall back to a fixed
schedule: flush at every task completion, rotate every fourth. Say plainly to the
user that the token signal is unavailable, rather than implying a low reading.

## Rotation is a full handoff

Rotation hands ownership to a successor coordinator and ends your run. Use the
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
rotation interrupted midway leaves some children moved and some not, which the
successor's reconciliation step below catches — a partial move is recoverable, a
prompt sent to a coordinator that owns nothing is not.

Refuse to rotate while `goal.md` or `handoff.md` is missing or empty. An
automatic rotation into an empty handoff produces a successor that confidently
invents the run's state; this has been observed in practice.

The successor's prompt carries the absolute path of the run directory, the
absolute path of the skill it must load, and nothing else that a file already
holds.

## Recovery after rotation

A successor starts from files, not from a summary it was told.

1. Read `goal.md` first, verbatim. It is the only record of the user's own
   words, and it outranks any later restatement.
2. Read `manifest.md` for what has landed, then `handoff.md` for what is live.
3. Reconcile `handoff.md` against the runtime before acting on it: a
   predecessor's self-written handoff is a claim, not a record. `worker-list`
   and the branch diff are the record. Check lineage in the same pass — a live
   worktree still parented to the predecessor means its rotation was
   interrupted; reparent it to yourself with `worktree set` and carry on.
4. Only then take a new decision.
