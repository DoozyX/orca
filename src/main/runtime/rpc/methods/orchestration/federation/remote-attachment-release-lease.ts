import type { RemoteDispatchAttachmentRow } from '../../../../orchestration/types'
import type { WorkerTerminalResourceRow } from '../../../../orchestration/worker-terminal-ownership'
import type { WorkerTerminalReleaseRuntime } from '../../../../orchestration/worker-terminal-release-runtime'
import type { inspectRemoteAttachment } from './federation-attachment-observation'

/** Whether the attachment still owns the exact process it is about to close. */
export function remoteAttachmentLeaseIsCurrent(
  runtime: WorkerTerminalReleaseRuntime,
  attachment: RemoteDispatchAttachmentRow,
  observation: Awaited<ReturnType<typeof inspectRemoteAttachment>>,
  resource: WorkerTerminalResourceRow
): boolean {
  const db = runtime.getOrchestrationDb()
  return Boolean(
    observation.exact &&
    observation.terminal?.handle === resource.terminal_handle &&
    attachment.terminal_handle === resource.terminal_handle &&
    resource.owner_dispatch_id === attachment.dispatch_id &&
    resource.ownership_state === 'owned' &&
    db.isRemoteAttachmentProcessCurrent({
      dispatchId: attachment.dispatch_id,
      paneKey: runtime.getTerminalPaneKey(resource.terminal_handle),
      processIncarnation: runtime.getTerminalProcessIncarnation(resource.terminal_handle)
    }) &&
    !db.workerTerminalResourceHasIdentityConflict(resource.id)
  )
}
