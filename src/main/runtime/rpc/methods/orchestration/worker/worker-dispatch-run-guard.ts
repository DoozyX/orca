import type { OrchestrationDb } from '../../../../orchestration/db'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

/** Refuses a Dispatch outside the named Run before any effect; an unknown Dispatch is left to the caller. */
export function assertWorkerDispatchInRun(
  db: OrchestrationDb,
  dispatchId: string,
  run: string | undefined
): void {
  if (run === undefined) {
    return
  }
  const dispatch = db.getDispatchContextById(dispatchId)
  if (dispatch && dispatch.run_id !== run) {
    throw new OrchestrationError(
      'dispatch_run_mismatch',
      `Dispatch ${dispatchId} belongs to Run ${dispatch.run_id}, not ${run}.`
    )
  }
}
