import type { OrchestrationDb } from '../orchestration-db'

/**
 * A session-graph reload can remint a live pane's handle; the custody row a start wrote at creation
 * follows the new handle only for the same owner, old handle and process.
 */
export function rebindWorkerTerminalResourceHandle(
  this: OrchestrationDb,
  params: { dispatchId: string; fromHandle: string; toHandle: string; processIncarnation: string }
): boolean {
  return (
    this.db
      .prepare(
        `UPDATE worker_terminal_resources
            SET terminal_handle = ?, updated_at = datetime('now')
          WHERE owner_dispatch_id = ? AND terminal_handle = ? AND process_incarnation = ?`
      )
      .run(params.toHandle, params.dispatchId, params.fromHandle, params.processIncarnation)
      .changes === 1
  )
}

export type WorkerTerminalHandleRebindMethods = {
  rebindWorkerTerminalResourceHandle: typeof rebindWorkerTerminalResourceHandle
}

export function attachWorkerTerminalHandleRebind(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, { rebindWorkerTerminalResourceHandle })
}
