import type { OrchestrationDb } from '../../../../orchestration/db'
import { isEquivalentPaneKey } from '../../../../orchestration/db/pane-key-match'

// Custody proves the created process during boot without granting Dispatch authority early.
export function isStartingWorkerTerminalCurrent(
  db: OrchestrationDb,
  dispatchId: string,
  paneKey: string | null,
  processIncarnation: string | null
): boolean {
  if (!paneKey || !processIncarnation || db.getWorkerDispatch(dispatchId)?.state !== 'starting') {
    return false
  }
  const dispatch = db.getDispatchContextById(dispatchId)
  if (
    !dispatch ||
    dispatch.status !== 'pending' ||
    dispatch.process_incarnation !== null ||
    dispatch.assignee_pane_key !== null
  ) {
    return false
  }
  const resource = db.getWorkerTerminalResourceByOwner(dispatchId)
  return Boolean(
    resource?.pane_key &&
    isEquivalentPaneKey(resource.pane_key, paneKey) &&
    resource.process_incarnation === processIncarnation
  )
}
