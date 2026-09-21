# Question rounds

Load this reference when delivering a frontier round, or when the session has no
native question tool.

## Use the session's own question tool

Deliver each round through the question tool the current session actually
exposes, following that tool's real schema and limits. Do not assume a tool
exists from the connector's name alone. A tool gives every question its own
answer slot, so one merged reply can no longer swallow half the round. Put the
recommended option first and label it `(Recommended)` where the tool supports a
label. A frontier larger than one call is two calls, never a prose list.

A dispatched worker never opens a question tool: its coordinator cannot see a
local prompt. It asks through the `ask` command in its live preamble, and the
`orchestration` skill owns that contract.

## Without a native question tool

Number the questions in one message, put a recommended answer under each, and
separate them with a rule, so the user can answer "1 yes, 2 as recommended, 3
the second option":

```text
Q1 - <title>: <question>
Recommended: <answer, one-line reason>
---
Q2 - <title>: <question>
Recommended: <answer, one-line reason>
```

## Keeping a round on the frontier

- A question whose answer lives in the repository, the environment, or a command
  you can run is a fact. Resolve it yourself and put only the decision to the
  user. Questions downstream of that fact wait for it; the rest of the round
  does not.
- A decision whose prerequisites are still open is a later round. Asking it now
  produces an answer the user has to revise.
- Stop only when every branch of the decision tree has been visited. Rounds are
  uncapped; an assumption the user never saw is the failure this loop prevents.

## For feature work, settle the contracts here

Before the frontier can be empty, the round must have settled the data model and
every contract that crosses a component boundary: types, signatures, schemas,
events, CLI flags, and API shapes. A later implementation stage that has to ask a
data-model question is a design gap, not a planning task.
