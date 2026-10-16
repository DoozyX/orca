import type { OrchestrationDb } from '../orchestration-db'

/**
 * Recording-only gates: `decision_gates.preserved_dispatch_id` names the supervised Dispatch a
 * gate was opened under, which that gate neither settles nor blocks. Gates from before v46 read
 * NULL, which marks a blocking gate.
 */
export function migrateV46(this: OrchestrationDb, current: number): void {
  if (current >= 46) {
    return
  }
  // Guarded because createTables runs first on every open and already gives a fresh database this.
  if (!this.hasColumn('decision_gates', 'preserved_dispatch_id')) {
    this.db.exec('ALTER TABLE decision_gates ADD COLUMN preserved_dispatch_id TEXT')
  }
}
