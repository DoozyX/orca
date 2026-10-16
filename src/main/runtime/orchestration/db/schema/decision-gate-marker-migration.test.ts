import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from '../../../../sqlite/sync-database'
import { OrchestrationDb } from '../orchestration-db'
import { SCHEMA_VERSION } from '../contract-constants'
import { resolveOrchestrationMigrationStartVersion } from '../../orchestration-schema-version-skew'

describe('decision gate recording-only marker migration', () => {
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

  it('adds a NULL marker to v45 gates without touching their other columns', () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-marker-v45-'))
    const dbPath = join(dir, 'orchestration.db')
    db = new OrchestrationDb(dbPath)
    // Why: rows under the legacy Run would read as an unadopted pre-Run graph and replay the chain.
    const run = db.createRun({
      objective: 'gate marker migration',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })
    const pendingTask = db.createTask({ runId: run.id, spec: 'pending gate' })
    const resolvedTask = db.createTask({ runId: run.id, spec: 'resolved gate' })
    db.createGate({ taskId: pendingTask.id, question: 'Proceed?', options: ['yes', 'no'] })
    const resolved = db.createGate({ taskId: resolvedTask.id, question: 'Ship?' })
    db.resolveGate(resolved.id, 'ship it')
    db.close()
    db = undefined

    const raw = new Database(dbPath)
    raw.exec('ALTER TABLE decision_gates DROP COLUMN preserved_dispatch_id')
    raw.pragma('user_version = 45')
    const before = raw.prepare('SELECT * FROM decision_gates ORDER BY id').all()
    expect(before).toHaveLength(2)
    expect(resolveOrchestrationMigrationStartVersion(raw, 45, SCHEMA_VERSION)).toBe(45)
    raw.close()

    db = new OrchestrationDb(dbPath)
    expect(db.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(db.hasColumn('decision_gates', 'preserved_dispatch_id')).toBe(true)
    const after = db.db.prepare('SELECT * FROM decision_gates ORDER BY id').all()
    expect(after).toEqual(
      before.map((row) => Object.assign({}, row, { preserved_dispatch_id: null }))
    )
    db.close()
    db = undefined

    db = new OrchestrationDb(dbPath)
    expect(db.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(db.db.prepare('SELECT * FROM decision_gates ORDER BY id').all()).toEqual(after)
  })

  it('treats a v46 stamp without the marker column as version skew', () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-marker-skew-'))
    const dbPath = join(dir, 'orchestration.db')
    new OrchestrationDb(dbPath).close()

    const raw = new Database(dbPath)
    raw.exec('ALTER TABLE decision_gates DROP COLUMN preserved_dispatch_id')
    expect(resolveOrchestrationMigrationStartVersion(raw, 46, SCHEMA_VERSION)).toBe(6)
    raw.close()
  })
})
