/** A stopped or abandoned worker's release is always refused `identity_unproven`. */
const RELEASABLE_WORKER_STATES = new Set(['succeeded', 'failed'])

/** Release states that already carry a decision, so another release is not owed. */
const DECIDED_RELEASE_STATES = new Set([
  'retained',
  'unknown',
  'requested',
  'releasing',
  'released'
])

/** The one reclaimable rule: worker-list's `reclaimable` filter and the fleet's `release` advice. */
export function isWorkerTerminalReclaimable(input: {
  workerState: string
  ownershipState: string
  releaseState: string
}): boolean {
  return (
    RELEASABLE_WORKER_STATES.has(input.workerState) &&
    input.ownershipState === 'owned' &&
    !DECIDED_RELEASE_STATES.has(input.releaseState)
  )
}
