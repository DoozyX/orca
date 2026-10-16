/**
 * A structured worker's turn that ends while its supervised Dispatch is still active ended without
 * `worker_done`. Recording that turn as finished makes the attempt project `finished_unverified`,
 * which fleet attention reports as `unverifiable`. Evidence only: nothing settles, closes or
 * succeeds here; the coordinator reads the transcript and decides.
 */

import { isOrcaSessionId } from '../../../shared/orca-session-address'
import type { OrchestrationDb } from './db'
import { addressableSessionParty } from './structured-session-mail-address'

export function recordStructuredTurnEndedWithoutReport(
  db: OrchestrationDb | null,
  turn: {
    sessionId: string
    status: 'working' | 'attention' | 'idle' | null
    statusStartedAt?: number
  }
): void {
  // Why: the idle edge's start names the turn that just ended; without it there is no turn to cite.
  if (
    !db ||
    turn.status !== 'idle' ||
    turn.statusStartedAt === undefined ||
    !isOrcaSessionId(turn.sessionId)
  ) {
    return
  }
  const party = addressableSessionParty(turn.sessionId, db)
  const dispatch =
    party && db.findActiveDispatchForAssignee(party.address, party.paneKey ?? undefined)
  // Only a supervised worker owes a report; a chat's own Dispatch does not.
  if (!dispatch || !db.getWorkerDispatch(dispatch.id)) {
    return
  }
  const id = `structured-turn-finished:${dispatch.id}:${turn.statusStartedAt}`
  const facts = db.getAttemptObservationFacts(dispatch.id)
  if (
    facts.some(
      (fact) =>
        fact.id === id || (fact.facet === 'worker_report' && fact.payload.status === 'accepted')
    )
  ) {
    return
  }
  db.recordAttemptObservation({
    id,
    dispatchId: dispatch.id,
    sequence: Math.max(-1, ...facts.map((fact) => fact.sequence)) + 1,
    authorityId: `run_home:${dispatch.run_id}`,
    authorityClock: 'home',
    facet: 'process_turn',
    payload: { process: 'running', turn: 'finished' },
    sourceObservedAt: turn.statusStartedAt,
    executionReceivedAt: null,
    homeReceivedAt: Date.now()
  })
}
