import {
  decideWorkerTerminalRelease,
  WORKER_SETTLED_STATES,
  WORKER_TERMINAL_RELEASABLE_ROW_SQL,
  type WorkerTerminalResourceRow
} from '../../worker-terminal-ownership'
import { OrchestrationError } from '../../orchestration-error'
import type { RemoteDispatchAttachmentRow } from '../../types'
import type { OrchestrationDb } from '../orchestration-db'
import type { WorkerTerminalReleaseRequest } from '../worker-terminal/worker-terminal-release'

export function requestRemoteAttachmentTerminalRelease(
  this: OrchestrationDb,
  dispatchId: string
): WorkerTerminalReleaseRequest {
  this.db.exec('BEGIN IMMEDIATE')
  try {
    const attachment = this.getRemoteDispatchAttachment(dispatchId)
    if (!attachment) {
      throw new OrchestrationError(
        'dispatch_not_found',
        `Remote Dispatch ${dispatchId} was not found.`
      )
    }
    if (!WORKER_SETTLED_STATES.includes(attachment.state)) {
      throw new OrchestrationError(
        'dispatch_inactive',
        `Remote Dispatch ${dispatchId} is ${attachment.state}; only a settled worker can release. Use worker-stop to cancel an active worker.`
      )
    }
    let resource = this.getWorkerTerminalResourceByOwner(dispatchId)
    let owner = attachment
    let chain: { resolvedDispatchId: string; currentOwner: WorkerTerminalResourceRow } | undefined
    if (!resource) {
      const transferred = this.getWorkerTerminalResourceFormerlyOwnedBy(dispatchId)
      if (!transferred) {
        this.db.exec('COMMIT')
        return { disposition: 'retained', resource: null, reason: 'no_owned_resource' }
      }
      const custodian = sameHomeAttachment(this, attachment, transferred.owner_dispatch_id)
      if (decideWorkerTerminalRelease(transferred).action === 'already_released') {
        this.db.exec('COMMIT')
        return {
          disposition: 'already_released',
          resource: transferred,
          ...(custodian ? { resolvedDispatchId: custodian.dispatch_id } : {})
        }
      }
      // Why: a Dispatch another home or this host's own Orca holds is neither named nor closed.
      if (!custodian) {
        this.db.exec('COMMIT')
        return { disposition: 'retained', resource: null, reason: 'ownership_transferred' }
      }
      // Why: act through the current owner only once it settled in the same Run; else name it.
      if (
        !WORKER_SETTLED_STATES.includes(custodian.state) ||
        custodian.home_run_id !== attachment.home_run_id
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
      owner = custodian
      chain = { resolvedDispatchId: custodian.dispatch_id, currentOwner: transferred }
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
      const holder =
        resource.ownership_state === 'external'
          ? this.findWorkerTerminalCustodian(resource)
          : chain?.currentOwner
      const named =
        holder && sameHomeAttachment(this, attachment, holder.owner_dispatch_id)
          ? holder
          : undefined
      this.db.exec('COMMIT')
      return {
        disposition: 'retained',
        resource,
        reason: decision.reason,
        ...resolved,
        ...(named ? { currentOwner: named } : {})
      }
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

/** The attachment holding `dispatchId` when the same home that started `attachment` started it. */
function sameHomeAttachment(
  db: OrchestrationDb,
  attachment: RemoteDispatchAttachmentRow,
  dispatchId: string
): RemoteDispatchAttachmentRow | undefined {
  const holder = db.getRemoteDispatchAttachment(dispatchId)
  return holder?.home_peer_fingerprint === attachment.home_peer_fingerprint ? holder : undefined
}

export type RemoteDispatchAttachmentReleaseMethods = {
  requestRemoteAttachmentTerminalRelease: typeof requestRemoteAttachmentTerminalRelease
}

export function attachRemoteDispatchAttachmentRelease(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, { requestRemoteAttachmentTerminalRelease })
}
