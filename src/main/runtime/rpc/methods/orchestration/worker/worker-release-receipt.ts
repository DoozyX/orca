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

/** A Dispatch's Run and worker state, and whether the Orca reading the receipt can act on it. */
export type ReleaseCustodian = {
  runId: string
  state: WorkerDispatchState | undefined
  /** False for a remote worker another Orca runs on this host: only that Orca's CLI reaches it. */
  readerCanAct: boolean
}

export type ReleaseCustody = (dispatchId: string) => ReleaseCustodian | undefined

export function localReleaseCustody(db: OrchestrationDb): ReleaseCustody {
  return (dispatchId) => {
    const dispatch = db.getDispatchContextById(dispatchId)
    if (dispatch) {
      return {
        runId: dispatch.run_id,
        state: db.getWorkerDispatch(dispatchId)?.state,
        readerCanAct: true
      }
    }
    // A remote worker another Orca starts here can take over a local worker's terminal.
    const attachment = db.getRemoteDispatchAttachment(dispatchId)
    return attachment
      ? { runId: attachment.home_run_id, state: attachment.state, readerCanAct: false }
      : undefined
  }
}

/** An execution host's attachments carry the home's Run, which the home's CLI names. */
export function remoteAttachmentReleaseCustody(db: OrchestrationDb): ReleaseCustody {
  return (dispatchId) => {
    const attachment = db.getRemoteDispatchAttachment(dispatchId)
    return attachment
      ? { runId: attachment.home_run_id, state: attachment.state, readerCanAct: true }
      : undefined
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
      recovery: `A user took this terminal over (${takeover.source}${at}); Orca will not close it.${inspectHolder(custody, holder.owner_dispatch_id)}`
    }
  }
  if (currentOwner && currentOwner.owner_dispatch_id !== dispatchId) {
    return {
      ...named,
      recovery: releaseThroughOwner(custody, dispatchId, currentOwner.owner_dispatch_id)
    }
  }
  if (retained.reason === 'ownership_transferred') {
    return { recovery: UNREACHABLE_HOLDER_RECOVERY }
  }
  if (resource?.ownership_state === 'external') {
    return {
      recovery:
        'Orca reused this terminal without owning it, so release leaves it open; close it yourself once it is no longer needed.'
    }
  }
  return {}
}

const UNREACHABLE_HOLDER_RECOVERY =
  'A Dispatch this Orca cannot act through now holds this terminal, so release leaves it open; close it where it was started once it is no longer needed.'

const RUN_BY_ANOTHER_ORCA = 'is a remote worker another Orca runs on this host'

function inspectHolder(custody: ReleaseCustody, holderId: string): string {
  const holder = custody(holderId)
  if (!holder) {
    return ''
  }
  const show = `orca orchestration worker-show --dispatch ${holderId}`
  return holder.readerCanAct
    ? ` Inspect with: ${show} --json`
    : ` Dispatch ${holderId} ${RUN_BY_ANOTHER_ORCA} (its Run ${holder.runId}); inspect it from that Orca: ${show} --json`
}

function releaseThroughOwner(custody: ReleaseCustody, dispatchId: string, ownerId: string): string {
  const owner = custody(ownerId)
  if (!owner) {
    return UNREACHABLE_HOLDER_RECOVERY
  }
  const pending =
    owner.state && !WORKER_SETTLED_STATES.includes(owner.state)
      ? ` once it settles (it is ${owner.state})`
      : ''
  const release = `orca orchestration worker-release --dispatch ${ownerId}`
  // Why: this Orca has no Dispatch by that ID, so the step has to run on the Orca that started it.
  if (!owner.readerCanAct) {
    return `Dispatch ${ownerId} now holds this terminal and ${RUN_BY_ANOTHER_ORCA}, so this Orca cannot release it; release it from that Orca${pending}: ${release} --run ${owner.runId} --json`
  }
  const otherRun = owner.runId !== custody(dispatchId)?.runId
  return `Dispatch ${ownerId}${otherRun ? ` in Run ${owner.runId}` : ''} now holds this terminal; release it through that Dispatch${pending}: ${release}${otherRun ? ` --run ${owner.runId}` : ''} --json`
}
