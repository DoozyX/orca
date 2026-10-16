import type { OrchestrationDb } from '../../../../orchestration/db'
import type { WorkerDispatchState } from '../../../../orchestration/types'
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

/** Where this runtime records a Dispatch's Run and how its worker stands. */
export type ReleaseCustody = {
  runOf: (dispatchId: string) => string | undefined
  stateOf: (dispatchId: string) => WorkerDispatchState | undefined
}

export function localReleaseCustody(db: OrchestrationDb): ReleaseCustody {
  return {
    runOf: (dispatchId) => db.getDispatchContextById(dispatchId)?.run_id,
    stateOf: (dispatchId) => db.getWorkerDispatch(dispatchId)?.state
  }
}

/** An execution host's attachments carry the home's Run, which the home's CLI names. */
export function remoteAttachmentReleaseCustody(db: OrchestrationDb): ReleaseCustody {
  return {
    runOf: (dispatchId) => db.getRemoteDispatchAttachment(dispatchId)?.home_run_id,
    stateOf: (dispatchId) => db.getRemoteDispatchAttachment(dispatchId)?.state
  }
}

/** Who holds a retained terminal, the takeover behind it, and what the coordinator can do next. */
export function retainedReleaseGuidance(
  custody: ReleaseCustody,
  retained: {
    dispatchId: string
    reason: WorkerTerminalRetainedReason
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
      recovery: releaseThroughOwner(custody, dispatchId, currentOwner.owner_dispatch_id)
    }
  }
  if (retained.reason === 'ownership_transferred') {
    return {
      recovery:
        'A Dispatch this Orca cannot act through now holds this terminal, so release leaves it open; close it where it was started once it is no longer needed.'
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

function releaseThroughOwner(custody: ReleaseCustody, dispatchId: string, ownerId: string): string {
  const ownerRun = custody.runOf(ownerId)
  const otherRun = ownerRun && ownerRun !== custody.runOf(dispatchId)
  const ownerState = custody.stateOf(ownerId)
  const pending =
    ownerState && !WORKER_SETTLED_STATES.includes(ownerState)
      ? ` once it settles (it is ${ownerState})`
      : ''
  return `Dispatch ${ownerId}${otherRun ? ` in Run ${ownerRun}` : ''} now holds this terminal; release it through that Dispatch${pending}: orca orchestration worker-release --dispatch ${ownerId}${otherRun ? ` --run ${ownerRun}` : ''} --json`
}
