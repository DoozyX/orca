import type { OrchestrationDb } from '../orchestration-db'
import { RESOURCE_LEASE_TABLES_SQL } from './create-core-tables-sql'

/** Shared resource leases: one holder per resource key and a FIFO of Runs waiting for it. */
export function migrateV47(this: OrchestrationDb, current: number): void {
  if (current >= 47) {
    return
  }
  this.db.exec(RESOURCE_LEASE_TABLES_SQL)
}
