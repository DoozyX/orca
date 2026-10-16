import {
  decideWorkerTerminalRelease,
  WORKER_SETTLED_STATES,
  WORKER_TERMINAL_RELEASABLE_ROW_SQL
} from '../../worker-terminal-ownership'
import type {
  WorkerTerminalArchiveStatus,
  WorkerTerminalResourceRow,
  WorkerTerminalRetainedReason
} from '../../worker-terminal-ownership'
import { OrchestrationError } from '../../orchestration-error'
import { parseWorkerTerminalPriorOwnerIds } from '../pane-key-match'
import type { OrchestrationDb } from '../orchestration-db'

/** `resolvedDispatchId` is the current owner a former owner's release acted through. */
export type WorkerTerminalReleaseRequest =
  | { disposition: 'requested'; resource: WorkerTerminalResourceRow; resolvedDispatchId?: string }
  | {
      disposition: 'already_released'
      resource: WorkerTerminalResourceRow
      resolvedDispatchId?: string
    }
  | {
      disposition: 'retained'
      resource: WorkerTerminalResourceRow | null
      reason: WorkerTerminalRetainedReason
      resolvedDispatchId?: string
      /** The row whose owner holds this terminal, when that is not the requesting Dispatch. */
      currentOwner?: WorkerTerminalResourceRow
    }

export function requestWorkerTerminalRelease(
  this: OrchestrationDb,
  dispatchId: string
): WorkerTerminalReleaseRequest {
  this.db.exec('BEGIN IMMEDIATE')
  try {
    const dispatch = this.getDispatchContextById(dispatchId)
    const worker = this.getWorkerDispatch(dispatchId)
    if (!dispatch) {
      throw new OrchestrationError('dispatch_not_found', `Dispatch ${dispatchId} was not found.`)
    }
    if (!worker) {
      if (!['completed', 'failed', 'circuit_broken'].includes(dispatch.status)) {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Dispatch ${dispatchId} is ${dispatch.status}; only a settled dispatch can release.`
        )
      }
      this.db.exec('COMMIT')
      return { disposition: 'retained', resource: null, reason: 'no_owned_resource' }
    }
    if (!WORKER_SETTLED_STATES.includes(worker.state)) {
      // Why: release is post-completion cleanup only; recording intent for an unsettled or
      // uncertain worker would let recovery close a terminal the coordinator never reviewed.
      throw new OrchestrationError(
        'dispatch_inactive',
        `Dispatch ${dispatchId} is ${worker.state}; only a settled worker can release. Use worker-stop to cancel an active worker.`
      )
    }
    let resource = this.getWorkerTerminalResourceByOwner(dispatchId)
    let owner = { dispatchId, state: worker.state }
    let chain: { resolvedDispatchId: string; currentOwner: WorkerTerminalResourceRow } | undefined
    if (!resource) {
      const transferred = this.getWorkerTerminalResourceFormerlyOwnedBy(dispatchId)
      if (!transferred) {
        this.db.exec('COMMIT')
        return { disposition: 'retained', resource: null, reason: 'no_owned_resource' }
      }
      const ownerId = transferred.owner_dispatch_id
      if (decideWorkerTerminalRelease(transferred).action === 'already_released') {
        this.db.exec('COMMIT')
        return {
          disposition: 'already_released',
          resource: transferred,
          resolvedDispatchId: ownerId
        }
      }
      const ownerWorker = this.getWorkerDispatch(ownerId)
      // Why: a former owner acts through the current owner only once it settled in the same Run;
      // otherwise it names that owner instead of closing a terminal another worker or Run holds.
      if (
        !ownerWorker ||
        !WORKER_SETTLED_STATES.includes(ownerWorker.state) ||
        this.getDispatchContextById(ownerId)?.run_id !== dispatch.run_id
      ) {
        this.db.exec('COMMIT')
        return {
          disposition: 'retained',
          resource: transferred,
          reason: 'ownership_transferred',
          currentOwner: transferred
        }
      }
      resource = transferred
      owner = { dispatchId: ownerId, state: ownerWorker.state }
      chain = { resolvedDispatchId: ownerId, currentOwner: transferred }
    }
    const resolved = chain ? { resolvedDispatchId: chain.resolvedDispatchId } : {}
    const decision = decideWorkerTerminalRelease(resource)
    if (decision.action === 'already_released') {
      this.db.exec('COMMIT')
      return { disposition: 'already_released', resource, ...resolved }
    }
    if (owner.state === 'stopped' || owner.state === 'abandoned') {
      this.db.exec('COMMIT')
      return { disposition: 'retained', resource, reason: 'identity_unproven', ...chain }
    }
    if (decision.action === 'retained') {
      const custodian =
        resource.ownership_state === 'external'
          ? this.findWorkerTerminalCustodian(resource)
          : chain?.currentOwner
      this.db.exec('COMMIT')
      return {
        disposition: 'retained',
        resource,
        reason: decision.reason,
        ...resolved,
        ...(custodian ? { currentOwner: custodian } : {})
      }
    }
    if (resource.release_state === 'retained' && resource.retained_reason === 'user_requested') {
      this.db
        .prepare('DELETE FROM worker_terminal_archives WHERE dispatch_id = ?')
        .run(owner.dispatchId)
    }
    this.db
      .prepare(
        `UPDATE worker_terminal_resources
         SET release_state = CASE
               WHEN release_state = 'releasing' THEN 'releasing'
               ELSE 'requested'
             END,
             retained_reason = NULL,
             release_requested_at = COALESCE(release_requested_at, datetime('now')),
             release_error = NULL, updated_at = datetime('now')
         WHERE id = ? AND ${WORKER_TERMINAL_RELEASABLE_ROW_SQL}`
      )
      .run(resource.id)
    this.db.exec('COMMIT')
    return {
      disposition: 'requested',
      ...resolved,
      resource: this.getWorkerTerminalResource(resource.id) as WorkerTerminalResourceRow
    }
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
}

export function settleDeadWorkerTerminalRelease(
  this: OrchestrationDb,
  params: {
    requestingDispatchId: string
    resourceId: string
    processIncarnation: string
  }
):
  | { disposition: 'released'; resource: WorkerTerminalResourceRow }
  | { disposition: 'retained'; resource: WorkerTerminalResourceRow } {
  this.db.exec('BEGIN IMMEDIATE')
  try {
    const resource = this.getWorkerTerminalResource(params.resourceId)
    if (!resource) {
      throw new OrchestrationError(
        'dispatch_not_found',
        `Worker terminal resource ${params.resourceId} was not found.`
      )
    }
    const priorOwners = parseWorkerTerminalPriorOwnerIds(resource.prior_owner_dispatch_ids)
    const requesterRelated =
      resource.owner_dispatch_id === params.requestingDispatchId ||
      priorOwners?.includes(params.requestingDispatchId) === true
    const requester = this.getWorkerDispatch(params.requestingDispatchId)
    const owner = this.getWorkerDispatch(resource.owner_dispatch_id)
    const requesterSettled = Boolean(requester && WORKER_SETTLED_STATES.includes(requester.state))
    const ownerSettled = Boolean(owner && WORKER_SETTLED_STATES.includes(owner.state))
    // A positive process-exit verdict only proves the exact process is gone; release is terminal
    // cleanup and must also preserve the worker's output. The archive is only ever written while
    // `release_state = 'requested'`, so an owner asking to release a pane that never reached that
    // state can never produce one — demanding it retained the pane forever. That one case settles
    // as `unavailable`; wherever the capture is still reachable the archive stays mandatory.
    const archive = this.getWorkerTerminalArchive(resource.owner_dispatch_id)
    const archiveUnreachable =
      resource.owner_dispatch_id === params.requestingDispatchId &&
      (resource.release_state === 'not_requested' || resource.release_state === 'retained')
    if (
      !priorOwners ||
      !requesterRelated ||
      !requesterSettled ||
      !ownerSettled ||
      resource.process_incarnation !== params.processIncarnation ||
      (archive ? archive.resource_id !== resource.id : !archiveUnreachable) ||
      decideWorkerTerminalRelease(resource).action !== 'proceed'
    ) {
      this.db.exec('COMMIT')
      return { disposition: 'retained', resource }
    }
    this.db
      .prepare(
        `UPDATE worker_terminal_resources
         SET release_state = 'released', ownership_state = 'released', retained_reason = NULL,
             archive_status = COALESCE(?, archive_status),
             release_requested_at = COALESCE(release_requested_at, datetime('now')),
             release_completed_at = datetime('now'), release_error = NULL,
             updated_at = datetime('now')
         WHERE id = ? AND process_incarnation = ? AND ${WORKER_TERMINAL_RELEASABLE_ROW_SQL}`
      )
      .run(
        archive ? null : ('unavailable' satisfies WorkerTerminalArchiveStatus),
        params.resourceId,
        params.processIncarnation
      )
    const released = this.getWorkerTerminalResource(params.resourceId) as WorkerTerminalResourceRow
    this.db.exec('COMMIT')
    return released.release_state === 'released'
      ? { disposition: 'released', resource: released }
      : { disposition: 'retained', resource: released }
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
}

export type WorkerTerminalReleaseMethods = {
  requestWorkerTerminalRelease: typeof requestWorkerTerminalRelease
  settleDeadWorkerTerminalRelease: typeof settleDeadWorkerTerminalRelease
}

export function attachWorkerTerminalRelease(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    requestWorkerTerminalRelease,
    settleDeadWorkerTerminalRelease
  })
}
