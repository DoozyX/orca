import type { OrchestrationDb } from '../orchestration-db'

/**
 * Takeover evidence: `takeover_source` names the input path that marked a worker terminal
 * user-owned and `takeover_at` when, so a genuine takeover can be told from a misclassification.
 * Rows taken over before v45 keep both NULL and report as unrecorded.
 */
export function migrateV45(this: OrchestrationDb, current: number): void {
  if (current >= 45) {
    return
  }
  // Guarded because createTables runs first on every open and already gives a fresh database these.
  if (!this.hasColumn('worker_terminal_resources', 'takeover_source')) {
    this.db.exec('ALTER TABLE worker_terminal_resources ADD COLUMN takeover_source TEXT')
  }
  if (!this.hasColumn('worker_terminal_resources', 'takeover_at')) {
    this.db.exec('ALTER TABLE worker_terminal_resources ADD COLUMN takeover_at TEXT')
  }
}
