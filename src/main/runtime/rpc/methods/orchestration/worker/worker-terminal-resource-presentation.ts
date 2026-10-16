import type {
  WorkerTerminalResourceRow,
  WorkerTerminalTakeoverEvidence
} from '../../../../orchestration/worker-terminal-ownership'

export function exposeWorkerTerminalResource(resource: WorkerTerminalResourceRow): {
  id: string
  ownershipState: string
  releaseState: string
  retainedReason: string | null
  terminalHandle: string
  worktreeId: string | null
  endpointId: string | null
  endpointIncarnation: string | null
  originDispatchId: string
  ownerDispatchId: string
  releaseRequestedAt: string | null
  releaseCompletedAt: string | null
  releaseError: string | null
  recoveryAttemptCount: number
  lastRecoveryAt: string | null
  archive: { source: string | null; status: string | null }
  takeover: WorkerTerminalTakeoverEvidence | null
} {
  return {
    id: resource.id,
    ownershipState: resource.ownership_state,
    releaseState: resource.release_state,
    retainedReason: resource.retained_reason,
    terminalHandle: resource.terminal_handle,
    worktreeId: resource.worktree_id,
    endpointId: resource.endpoint_id,
    endpointIncarnation: resource.endpoint_incarnation,
    originDispatchId: resource.origin_dispatch_id,
    ownerDispatchId: resource.owner_dispatch_id,
    releaseRequestedAt: resource.release_requested_at,
    releaseCompletedAt: resource.release_completed_at,
    releaseError: resource.release_error,
    recoveryAttemptCount: resource.recovery_attempt_count,
    lastRecoveryAt: resource.last_recovery_at,
    archive: { source: resource.archive_source, status: resource.archive_status },
    takeover: workerTerminalTakeoverEvidence(resource)
  }
}

/** The signal behind a user takeover; null for a row retained for any other reason. */
export function workerTerminalTakeoverEvidence(
  resource: WorkerTerminalResourceRow
): WorkerTerminalTakeoverEvidence | null {
  if (resource.retained_reason !== 'user_takeover') {
    return null
  }
  return resource.takeover_source
    ? { source: resource.takeover_source, at: resource.takeover_at }
    : { source: 'unrecorded', at: null }
}

export function takeoverReceiptField(resource: WorkerTerminalResourceRow): {
  takeover?: WorkerTerminalTakeoverEvidence
} {
  const takeover = workerTerminalTakeoverEvidence(resource)
  return takeover ? { takeover } : {}
}

export function archiveSummary(
  resource: WorkerTerminalResourceRow | null
): { source: string | null; status: string | null } | null {
  if (!resource) {
    return null
  }
  if (!resource.archive_source && !resource.archive_status) {
    return null
  }
  return { source: resource.archive_source, status: resource.archive_status }
}
