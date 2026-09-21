# Deployed-system verification

Load this reference when the question is whether a deployed system satisfies a
defined contract. A verification entrance assumes **no edit**: do not enter the
implement, PR, CI, or deployment stages unless the outcome and the authorized
scope explicitly permit delivery.

Run these four phases before any per-task pipeline.

## 1. Recon

Record, before any measurement:

- the deployed version, revision, or digest actually under test;
- the target environment and its licensing or entitlement state;
- the authorized scope — what may be touched, and what may not;
- one stable arm ID per evidence arm and the single question that arm answers;
- the exact artifact path and schema each arm will produce;
- a freshness cutoff, past which evidence is stale;
- what evidence distinguishes product behavior from harness, environment, and
  license failures.

Write the arm schema to **one** declared file and pass that path into every arm's
Task spec and into the reporting Task. One schema file, named the same way for
everyone, is what stops a downstream worker from validating against a shape it
imagined.

## 2. Independent measurement arms

Dispatch the arms as one parallel wave so they cannot share conclusions or
contaminate one another's evidence. Each arm writes its machine-readable artifact,
settles, and reports the artifact path. **A path reported before the producer
settled is not ready for use** — an arm that names its output file and then keeps
writing has told you where to look, not that there is anything to look at.

## 3. Validation and adjudication

Before reading even the deciding fields, validate each artifact against the
declared schema file, its provenance, its producer's completion, and its freshness
against the recon cutoff. Then read only the deciding fields.

Adjudicate contradictions rather than selecting the convenient result. For a flaky
external measurement, preserve and diagnose the first failure evidence, then
permit at most **one** clean rerun. A second failure is a product `defect` when it
demonstrates product behavior, or `inconclusive` when the harness, the
environment, or licensing prevented a trustworthy decision.

Loss of contact with an arm is not evidence about the deployed system: preserve
the verdict vocabulary `live` / `unverifiable` / `exited` for the arm itself, and
keep its absence out of the product verdict.

## 4. Consolidated report

Record the deployed identity, the environment, the authorized scope, each arm's
question and evidence, the artifact-validation results, every contradiction and
how it was adjudicated, and exactly one outcome:

- **`pass`** — terminal. No edit, no PR, no CI run, no deployment.
- **`defect`** — enters the delivery pipeline **only** when the defect is inside
  the authorized scope. Outside it, the defect is reported, not fixed.
- **`inconclusive`** — terminates honestly with what blocked a trustworthy
  decision. Do not claim success and do not retry indefinitely.

`inconclusive` is for evidence that is missing, stale, unattributable, or
contradictory — **never for packaging**. A report that rules against a run because
the arms wrote Markdown where it expected JSON, without challenging a single
measurement, has answered the wrong question: the declared schema file wins, and a
shape mismatch comes back to you as a question.
