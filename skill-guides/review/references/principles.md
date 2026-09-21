# Principle lenses

Shared vocabulary for `review`'s adversarial layer, `tdd`'s refactor step, and
`brainstorming`'s architecture pass. These four lenses exist to name what is
actually wrong in a change, not to enforce style for its own sake.

## DRY

Eliminating duplicated *knowledge*, not duplicated characters. The same rule or
decision should live in one place.

- Copy-pasted logic drifting apart: two near-identical blocks that started as one
  copy and have since diverged, so a fix to one silently misses the other.
- The same business rule — a threshold, a status mapping — hardcoded in several
  files instead of one source of truth.
- A bug fixed in one copy of duplicated code and not in its sibling.

## KISS

Choosing the most direct implementation that satisfies the requirement, not the
cleverest one.

- A needless abstraction layer: an interface, factory, or wrapper with exactly
  one implementation and no second caller in sight.
- Indirection — configuration-driven dispatch, generic hooks — standing in for
  what could be a direct call or a plain conditional.
- Boolean-flag parameters that silently switch a function between two unrelated
  behaviors instead of being two functions.

## YAGNI

Building for the requirement in front of you, not the one you are guessing at.

- Speculative generality: extension points, configuration options, or parameters
  with no current caller.
- An abstract base or plugin system built for a second implementation that does
  not exist yet.
- Unused error-handling branches or feature flags for scenarios nothing in the
  codebase can trigger.

## SOLID

Each unit has one reason to change and depends on abstractions rather than on
another unit's internals.

- A module that mixes unrelated responsibilities — parsing, persistence, and
  presentation in one file — and grows on every unrelated feature.
- A caller reaching into another module's internals or concrete type instead of
  its public interface.
- A new subtype forcing edits to a shared branch chain instead of extending
  independently.

## The limit of a lens

A principle is a lens, not a rule to enforce against the user's stated
requirements. An abstraction the design explicitly asked for is not YAGNI, and
duplicating logic twice is not automatically a DRY violation. Name the cost, not
the label.
