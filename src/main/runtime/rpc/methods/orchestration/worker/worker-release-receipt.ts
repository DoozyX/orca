import type { OrchestrationDb } from '../../../../orchestration/db'
import {
  WORKER_SETTLED_STATES,
  type WorkerTerminalResourceRow,
  type WorkerTerminalRetainedReason,
  type WorkerTerminalTakeoverEvidence
} from '../../../../orchestration/worker-terminal-ownership'
import { workerTerminalTakeoverEvidence } from './worker-terminal-resource-presentation'

export type WorkerReleaseReceipt = {
  dispatchId: string
  state: 'released' | 'already_released' | 'retained' | 'release_pending' | 'release_unknown'
  reason?: WorkerTerminalRetainedReason
  processAction: 'closed_agent_terminal' | 'closed_exited_terminal' | 'none'
  archive: { source: string | null; status: string | null } | null
  recovery?: string
  lastError?: string
  /** The Dispatch that owned the terminal when a former owner's release acted through it. */
  resolvedDispatchId?: string
  /** The Dispatch that holds a retained terminal the requesting Dispatch no longer owns. */
  currentOwnerDispatchId?: string
  /** The input that took the terminal over, on a receipt retained for a user takeover. */
  takeover?: WorkerTerminalTakeoverEvidence
}

/** Who holds a retained terminal, the takeover behind it, and what the coordinator can do next. */
export function retainedReleaseGuidance(
  db: OrchestrationDb,
  retained: {
    dispatchId: string
    resource: WorkerTerminalResourceRow | null
    currentOwner?: WorkerTerminalResourceRow
  }
): Pick<WorkerReleaseReceipt, 'currentOwnerDispatchId' | 'takeover' | 'recovery'> {
  const { dispatchId, resource, currentOwner } = retained
  const holder = currentOwner ?? resource
  const named = currentOwner ? { currentOwnerDispatchId: currentOwner.owner_dispatch_id } : {}
  const takeover = holder ? workerTerminalTakeoverEvidence(holder) : null
  if (holder && takeover) {
    const at = takeover.at ? ` at ${takeover.at} UTC` : ''
    return {
      ...named,
      takeover,
      recovery: `A user took this terminal over (${takeover.source}${at}); Orca will not close it. Inspect with: orca orchestration worker-show --dispatch ${holder.owner_dispatch_id} --json`
    }
  }
  if (currentOwner && currentOwner.owner_dispatch_id !== dispatchId) {
    return {
      ...named,
      recovery: releaseThroughOwner(db, dispatchId, currentOwner.owner_dispatch_id)
    }
  }
  if (resource?.ownership_state === 'external') {
    return {
      recovery:
        'Orca reused this terminal without owning it, so release leaves it open; close it yourself once it is no longer needed.'
    }
  }
  return {}
}

function releaseThroughOwner(db: OrchestrationDb, dispatchId: string, ownerId: string): string {
  const ownerRun = db.getDispatchContextById(ownerId)?.run_id
  const otherRun = ownerRun && ownerRun !== db.getDispatchContextById(dispatchId)?.run_id
  const ownerState = db.getWorkerDispatch(ownerId)?.state
  const pending =
    ownerState && !WORKER_SETTLED_STATES.includes(ownerState)
      ? ` once it settles (it is ${ownerState})`
      : ''
  return `Dispatch ${ownerId}${otherRun ? ` in Run ${ownerRun}` : ''} now holds this terminal; release it through that Dispatch${pending}: orca orchestration worker-release --dispatch ${ownerId}${otherRun ? ` --run ${ownerRun}` : ''} --json`
}
