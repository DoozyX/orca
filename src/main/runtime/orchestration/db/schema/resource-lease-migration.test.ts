import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from '../../../../sqlite/sync-database'
import { resolveOrchestrationMigrationStartVersion } from '../../orchestration-schema-version-skew'
import { SCHEMA_VERSION } from '../contract-constants'
import { OrchestrationDb } from '../orchestration-db'

const DROP_LEASE_TABLES = 'DROP TABLE resource_leases; DROP TABLE resource_lease_waiters;'

function columnsOf(db: Database.Database, table: string): unknown[] {
  return db.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').all(table)
}

describe('resource lease schema migration (v47)', () => {
  let dir: string | undefined
  let db: OrchestrationDb | undefined

  afterEach(() => {
    db?.close()
    db = undefined
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  it('upgrades a v46 database to v47 with both lease tables and its rows intact', () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-resource-lease-v46-'))
    const dbPath = join(dir, 'orchestration.db')
    db = new OrchestrationDb(dbPath)
    // Why: rows under the legacy Run would read as an unadopted pre-Run graph and replay the chain.
    const run = db.createRun({
      objective: 'lease migration',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })
    const task = db.createTask({ runId: run.id, spec: 'kept across the upgrade' })
    const message = db.insertMessage({
      runId: run.id,
      from: 'term_worker',
      to: `run:${run.id}`,
      subject: 'kept too'
    })
    db.close()
    db = undefined

    const raw = new Database(dbPath)
    raw.exec(DROP_LEASE_TABLES)
    raw.pragma('user_version = 46')
    const before = {
      run: raw.prepare('SELECT * FROM runs WHERE id = ?').get(run.id),
      task: raw.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id),
      message: raw.prepare('SELECT * FROM messages WHERE id = ?').get(message.id)
    }
    expect(resolveOrchestrationMigrationStartVersion(raw, 46, SCHEMA_VERSION)).toBe(46)
    raw.close()

    db = new OrchestrationDb(dbPath)
    expect(db.db.pragma('user_version', { simple: true })).toBe(47)
    expect({
      run: db.db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id),
      task: db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id),
      message: db.db.prepare('SELECT * FROM messages WHERE id = ?').get(message.id)
    }).toEqual(before)
    expect(columnsOf(db.db, 'resource_leases')).toEqual(
      ['resource_key', 'holder_run_id', 'acquired_at', 'expires_at'].map((name) => ({ name }))
    )
    expect(columnsOf(db.db, 'resource_lease_waiters')).toEqual(
      ['resource_key', 'run_id', 'position', 'ttl_ms', 'enqueued_at'].map((name) => ({ name }))
    )
    expect(
      db.acquireResourceLease({
        resourceKey: 'sim:iphone-17-pro',
        runId: run.id,
        ttlMs: 60_000,
        nowMs: 1_000
      })
    ).toMatchObject({ status: 'acquired' })
  })

  it('treats a v47 stamp without the lease tables as version skew', () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-resource-lease-skew-'))
    const dbPath = join(dir, 'orchestration.db')
    new OrchestrationDb(dbPath).close()

    const raw = new Database(dbPath)
    raw.exec(DROP_LEASE_TABLES)
    raw.pragma('user_version = 47')
    expect(resolveOrchestrationMigrationStartVersion(raw, 47, SCHEMA_VERSION)).toBeLessThan(47)
    raw.close()
  })
})
