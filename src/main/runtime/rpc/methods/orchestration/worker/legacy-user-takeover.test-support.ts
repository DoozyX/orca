import type { OrchestrationDb } from '../../../../orchestration/db'
import type { WorkerTerminalTakeoverSource } from '../../../../orchestration/worker-terminal-ownership'

/** Typing no longer takes a worker over; older builds left these rows behind, so tests write them directly. */
export function recordLegacyUserTakeover(
  db: OrchestrationDb,
  paneKey: string,
  source: WorkerTerminalTakeoverSource | null
): number {
  return Number(
    db.db
      .prepare(
        `UPDATE worker_terminal_resources
         SET ownership_state = 'user_owned', release_state = 'retained',
             retained_reason = 'user_takeover', takeover_source = ?,
             takeover_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END,
             updated_at = datetime('now')
         WHERE pane_key = ? AND ownership_state = 'owned'`
      )
      .run(source, source, paneKey).changes
  )
}
