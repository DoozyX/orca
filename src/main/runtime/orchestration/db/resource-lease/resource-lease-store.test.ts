import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS } from '../../../../../shared/rpc-contract/orchestration-lease-params'
import { OrchestrationError } from '../../orchestration-error'
import { OrchestrationDb } from '../orchestration-db'

const KEY = 'sim:iphone-17-pro'

function caught(call: () => unknown): unknown {
  try {
    call()
  } catch (error) {
    return error
  }
  return undefined
}

describe('resource lease store', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  function acquire(runId: string, nowMs: number, ttlMs = 60_000) {
    return db.acquireResourceLease({ resourceKey: KEY, runId, ttlMs, nowMs })
  }

  function release(runId: string, nowMs: number) {
    return db.releaseResourceLease({ resourceKey: KEY, runId, nowMs })
  }

  function show(nowMs: number) {
    return db.showResourceLease({ resourceKey: KEY, nowMs })
  }

  function tableRows() {
    return {
      leases: db.db.prepare('SELECT * FROM resource_leases ORDER BY resource_key').all(),
      waiters: db.db
        .prepare('SELECT * FROM resource_lease_waiters ORDER BY resource_key, position')
        .all()
    }
  }

  it('acquires a free resource for its TTL', () => {
    expect(acquire('run_a', 1_000)).toEqual({
      status: 'acquired',
      holder: { runId: 'run_a', acquiredAt: 1_000, expiresAt: 61_000 }
    })
  })

  it('renews the holder from now without moving acquiredAt', () => {
    acquire('run_a', 1_000)

    expect(acquire('run_a', 2_000)).toEqual({
      status: 'renewed',
      holder: { runId: 'run_a', acquiredAt: 1_000, expiresAt: 62_000 }
    })
  })

  it('queues other Runs in arrival order, once each', () => {
    acquire('run_a', 1_000)
    const holder = { runId: 'run_a', acquiredAt: 1_000, expiresAt: 61_000 }

    expect(acquire('run_b', 2_000)).toEqual({ status: 'queued', position: 1, holder })
    expect(acquire('run_c', 3_000)).toEqual({ status: 'queued', position: 2, holder })
    expect(acquire('run_b', 4_000)).toEqual({ status: 'queued', position: 1, holder })
    expect(tableRows().waiters).toEqual([
      { resource_key: KEY, run_id: 'run_b', position: 1, ttl_ms: 60_000, enqueued_at: 2_000 },
      { resource_key: KEY, run_id: 'run_c', position: 2, ttl_ms: 60_000, enqueued_at: 3_000 }
    ])
  })

  it('hands the lease to the head waiter, with its own TTL, when the holder releases', () => {
    acquire('run_a', 1_000)
    acquire('run_b', 2_000, 90_000)
    acquire('run_c', 3_000, 30_000)

    expect(release('run_a', 5_000)).toEqual({
      status: 'released',
      promoted: { runId: 'run_b', acquiredAt: 5_000, expiresAt: 95_000 }
    })
    expect(show(5_000)).toEqual({
      resourceKey: KEY,
      holder: { runId: 'run_b', acquiredAt: 5_000, expiresAt: 95_000, expired: false },
      next: { runId: 'run_c', ttlMs: 30_000 },
      waiters: [{ runId: 'run_c', position: 1, ttlMs: 30_000, enqueuedAt: 3_000 }]
    })
  })

  it('frees the resource when the holder releases with nobody waiting', () => {
    acquire('run_a', 1_000)

    expect(release('run_a', 5_000)).toEqual({ status: 'released', promoted: null })
    expect(show(5_000)).toEqual({ resourceKey: KEY, holder: null, next: null, waiters: [] })
  })

  it('lets a waiter leave the queue, and changes nothing for a Run that neither holds nor waits', () => {
    acquire('run_a', 1_000)
    acquire('run_b', 2_000)
    acquire('run_c', 3_000)

    expect(release('run_b', 4_000)).toEqual({ status: 'dequeued' })
    expect(show(4_000)).toMatchObject({
      holder: { runId: 'run_a', expiresAt: 61_000 },
      waiters: [{ runId: 'run_c', position: 1 }]
    })

    const before = tableRows()
    expect(release('run_z', 5_000)).toEqual({ status: 'not_held' })
    expect(tableRows()).toEqual(before)
  })

  describe('TTL expiry', () => {
    beforeEach(() => {
      acquire('run_a', 1_000)
      acquire('run_b', 2_000)
    })

    it('show reports an expired holder and the next waiter, and writes nothing', () => {
      const before = tableRows()

      for (let call = 0; call < 2; call += 1) {
        expect(show(70_000)).toEqual({
          resourceKey: KEY,
          holder: { runId: 'run_a', acquiredAt: 1_000, expiresAt: 61_000, expired: true },
          next: { runId: 'run_b', ttlMs: 60_000 },
          waiters: [{ runId: 'run_b', position: 1, ttlMs: 60_000, enqueuedAt: 2_000 }]
        })
      }
      expect(tableRows()).toEqual(before)
    })

    it('show reports the holder live until its expiry instant', () => {
      expect(show(60_999).holder).toMatchObject({ runId: 'run_a', expired: false })
      expect(show(61_000).holder).toMatchObject({ runId: 'run_a', expired: true })
    })

    it('an acquire by another Run expires the holder and promotes the head waiter first', () => {
      expect(acquire('run_c', 70_000)).toEqual({
        status: 'queued',
        position: 1,
        holder: { runId: 'run_b', acquiredAt: 70_000, expiresAt: 130_000 }
      })
      expect(show(70_000)).toEqual({
        resourceKey: KEY,
        holder: { runId: 'run_b', acquiredAt: 70_000, expiresAt: 130_000, expired: false },
        next: { runId: 'run_c', ttlMs: 60_000 },
        waiters: [{ runId: 'run_c', position: 1, ttlMs: 60_000, enqueuedAt: 70_000 }]
      })
    })

    it('rolls the expiry and promotion back when the acquire fails after promoting', () => {
      const before = tableRows()
      // Fires only once run_b already holds, so the failure lands strictly after the promotion.
      db.db.exec(`
        CREATE TEMP TRIGGER fail_lease_enqueue BEFORE INSERT ON resource_lease_waiters
        WHEN NEW.run_id = 'run_c'
          AND EXISTS (SELECT 1 FROM resource_leases WHERE holder_run_id = 'run_b')
        BEGIN SELECT RAISE(ABORT, 'injected enqueue failure'); END;
      `)

      expect(() => acquire('run_c', 70_000)).toThrow('injected enqueue failure')
      expect(tableRows()).toEqual(before)
    })

    it('a release by a Run that neither holds nor waits still expires and promotes', () => {
      expect(release('run_c', 70_000)).toEqual({ status: 'not_held' })
      expect(show(70_000)).toMatchObject({
        holder: { runId: 'run_b', acquiredAt: 70_000, expiresAt: 130_000, expired: false },
        next: null,
        waiters: []
      })
    })

    it('a release by the expired holder hands the lease to the head waiter', () => {
      expect(release('run_a', 70_000)).toEqual({
        status: 'released',
        promoted: { runId: 'run_b', acquiredAt: 70_000, expiresAt: 130_000 }
      })
    })

    it('a release by the head waiter after expiry frees the resource it was promoted to', () => {
      expect(release('run_b', 70_000)).toEqual({ status: 'released', promoted: null })
      expect(show(70_000)).toEqual({ resourceKey: KEY, holder: null, next: null, waiters: [] })
      expect(tableRows()).toEqual({ leases: [], waiters: [] })
    })

    it('a release by the head waiter after expiry hands the lease on to the next waiter', () => {
      acquire('run_c', 3_000, 30_000)

      expect(release('run_b', 70_000)).toEqual({
        status: 'released',
        promoted: { runId: 'run_c', acquiredAt: 70_000, expiresAt: 100_000 }
      })
      expect(show(70_000)).toEqual({
        resourceKey: KEY,
        holder: { runId: 'run_c', acquiredAt: 70_000, expiresAt: 100_000, expired: false },
        next: null,
        waiters: []
      })
    })

    it('rolls the whole release back when it fails after promoting the next waiter', () => {
      acquire('run_c', 3_000, 30_000)
      const before = tableRows()
      db.db.exec(`
        CREATE TEMP TRIGGER fail_lease_handoff BEFORE INSERT ON resource_leases
        WHEN NEW.holder_run_id = 'run_c'
        BEGIN SELECT RAISE(ABORT, 'injected handoff failure'); END;
      `)

      expect(() => release('run_b', 70_000)).toThrow('injected handoff failure')
      expect(tableRows()).toEqual(before)
    })
  })

  it('reports an expired holder with nobody next, then mints a new lease for its re-acquire', () => {
    acquire('run_a', 1_000)

    expect(show(70_000)).toEqual({
      resourceKey: KEY,
      holder: { runId: 'run_a', acquiredAt: 1_000, expiresAt: 61_000, expired: true },
      next: null,
      waiters: []
    })
    expect(acquire('run_a', 70_000)).toEqual({
      status: 'acquired',
      holder: { runId: 'run_a', acquiredAt: 70_000, expiresAt: 130_000 }
    })
  })

  it('keeps leases on different resources apart', () => {
    acquire('run_a', 1_000)

    expect(
      db.acquireResourceLease({ resourceKey: 'sim:ipad', runId: 'run_b', ttlMs: 1_000, nowMs: 2 })
    ).toMatchObject({ status: 'acquired', holder: { runId: 'run_b' } })
    expect(show(2_000).holder).toMatchObject({ runId: 'run_a' })
  })

  it.each([
    ['a zero TTL', { ttlMs: 0 }],
    ['a negative TTL', { ttlMs: -1 }],
    ['a TTL over the maximum', { ttlMs: ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS + 1 }],
    ['a non-integer TTL', { ttlMs: 1.5 }],
    ['an empty resource key', { resourceKey: '' }],
    ['a resource key over 200 characters', { resourceKey: 'k'.repeat(201) }]
  ])('refuses an acquire with %s as invalid_argument', (_label, override) => {
    const thrown = caught(() =>
      db.acquireResourceLease({
        resourceKey: KEY,
        runId: 'run_a',
        ttlMs: 60_000,
        nowMs: 1_000,
        ...override
      })
    )

    expect(thrown).toBeInstanceOf(OrchestrationError)
    expect(thrown).toMatchObject({ code: 'invalid_argument' })
    expect(tableRows()).toEqual({ leases: [], waiters: [] })
  })

  it('accepts a 200-character key and the maximum TTL', () => {
    expect(
      db.acquireResourceLease({
        resourceKey: 'k'.repeat(200),
        runId: 'run_a',
        ttlMs: ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS,
        nowMs: 0
      })
    ).toMatchObject({ status: 'acquired' })
  })

  it.each([
    ['release', () => db.releaseResourceLease({ resourceKey: '', runId: 'run_a', nowMs: 1 })],
    ['show', () => db.showResourceLease({ resourceKey: 'k'.repeat(201), nowMs: 1 })]
  ])('refuses a %s with an invalid resource key as invalid_argument', (_verb, call) => {
    const thrown = caught(call)

    expect(thrown).toBeInstanceOf(OrchestrationError)
    expect(thrown).toMatchObject({ code: 'invalid_argument' })
  })

  it('orchestration reset --all deletes every lease and waiter', () => {
    acquire('run_a', 1_000)
    acquire('run_b', 2_000)

    db.resetAll()

    expect(tableRows()).toEqual({ leases: [], waiters: [] })
  })
})
