import type { OrchestrationDb } from '../orchestration-db'

/**
 * Typed-wait deliveries: `wake_types` records the type set a typed `check --wait` built the batch
 * for (NULL for an untyped batch), and the one-outstanding trigger is keyed by it, so a typed wait
 * builds a batch of only its types while a nonmatching batch stays outstanding.
 */
export function migrateV44(this: OrchestrationDb, current: number): void {
  if (current >= 44) {
    return
  }
  // Guarded because createTables runs first on every open and already gives a fresh database this.
  if (!this.hasColumn('deliveries', 'wake_types')) {
    this.db.exec('ALTER TABLE deliveries ADD COLUMN wake_types TEXT')
  }
}
