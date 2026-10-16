import '../../../unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../../../../../shared/protocol-version'
import { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationDb } from '../../../../orchestration/db'
import type { RpcResponse } from '../../../core'
import { RpcDispatcher } from '../../../dispatcher'
import { ORCHESTRATION_METHODS } from '../../orchestration'

const KEY = 'sim:iphone-17-pro'
const PANES: Readonly<Record<string, string>> = {
  term_coord_a: 'tab_a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  term_coord_b: 'tab_b:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  term_stranger: 'tab_s:cccccccc-cccc-4ccc-8ccc-cccccccccccc'
}

describe('orchestration lease RPC methods', () => {
  let db: OrchestrationDb
  let dispatcher: RpcDispatcher
  let runA: string
  let runB: string
  let sequence = 0

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000)
    db = new OrchestrationDb(':memory:')
    const runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) => PANES[handle] ?? null)
    runA = db.createRun({
      objective: 'a',
      coordinatorHandle: 'term_coord_a',
      coordinatorPaneKey: PANES.term_coord_a
    }).id
    runB = db.createRun({
      objective: 'b',
      coordinatorHandle: 'term_coord_b',
      coordinatorPaneKey: PANES.term_coord_b
    }).id
    dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    db.close()
  })

  async function call(method: string, params: Record<string, unknown>): Promise<RpcResponse> {
    sequence += 1
    return await dispatcher.dispatch({
      id: `rpc_${sequence}`,
      authToken: 'caller-token',
      method: `orchestration.${method}`,
      params,
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
      orchestrationRequestId: `lease_request_${sequence}`
    })
  }

  function leaseRows() {
    return {
      leases: db.db.prepare('SELECT * FROM resource_leases').all(),
      waiters: db.db.prepare('SELECT * FROM resource_lease_waiters ORDER BY position').all()
    }
  }

  function receiptCount(): number {
    return db.db.prepare('SELECT 1 FROM mutation_receipts').all().length
  }

  it('acquires and releases for the Run its bound coordinator calls from', async () => {
    expect(
      await call('leaseAcquire', { resource: KEY, ttlMs: 600_000, from: 'term_coord_a' })
    ).toMatchObject({
      ok: true,
      result: {
        status: 'acquired',
        holder: { runId: runA, acquiredAt: 1_000, expiresAt: 601_000 }
      }
    })
    expect(await call('leaseAcquire', { resource: KEY, from: 'term_coord_b' })).toMatchObject({
      ok: true,
      result: { status: 'queued', position: 1, holder: { runId: runA } }
    })

    vi.setSystemTime(5_000)
    expect(
      await call('leaseRelease', { resource: KEY, run: runA, from: 'term_coord_a' })
    ).toMatchObject({
      ok: true,
      result: {
        status: 'released',
        // The default TTL applies when acquire names none.
        promoted: { runId: runB, acquiredAt: 5_000, expiresAt: 1_805_000 }
      }
    })
  })

  it.each([
    ['leaseAcquire', { resource: KEY }],
    ['leaseRelease', { resource: KEY }]
  ])(
    '%s refuses a caller that coordinates no Run but names one, with no effects',
    async (method, params) => {
      await call('leaseAcquire', { resource: KEY, from: 'term_coord_a' })
      const before = leaseRows()

      expect(await call(method, { ...params, run: runA, from: 'term_stranger' })).toMatchObject({
        ok: false,
        error: { code: 'consumer_fenced' }
      })
      expect(leaseRows()).toEqual(before)
    }
  )

  it.each([
    ['leaseAcquire', { resource: KEY }],
    ['leaseRelease', { resource: KEY }]
  ])(
    '%s refuses --run for a Run the caller does not coordinate, with no effects',
    async (method, params) => {
      await call('leaseAcquire', { resource: KEY, from: 'term_coord_a' })
      const before = leaseRows()

      expect(await call(method, { ...params, run: runA, from: 'term_coord_b' })).toMatchObject({
        ok: false,
        error: { code: 'consumer_fenced' }
      })
      expect(leaseRows()).toEqual(before)
    }
  )

  it('refuses an invalid TTL as invalid_argument', async () => {
    expect(
      await call('leaseAcquire', { resource: KEY, ttlMs: 0, from: 'term_coord_a' })
    ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(leaseRows()).toEqual({ leases: [], waiters: [] })
  })

  it('shows an expired holder to any caller without writing or recording a receipt', async () => {
    await call('leaseAcquire', { resource: KEY, ttlMs: 60_000, from: 'term_coord_a' })
    await call('leaseAcquire', { resource: KEY, ttlMs: 60_000, from: 'term_coord_b' })
    // Positive control: the two acquires above are receipted mutations.
    expect(receiptCount()).toBe(2)
    const before = leaseRows()

    vi.setSystemTime(70_000)
    for (const params of [{ resource: KEY, from: 'term_stranger' }, { resource: KEY }]) {
      expect(await call('leaseShow', params)).toMatchObject({
        ok: true,
        result: {
          resourceKey: KEY,
          holder: { runId: runA, acquiredAt: 1_000, expiresAt: 61_000, expired: true },
          next: { runId: runB, ttlMs: 60_000 },
          waiters: [{ runId: runB, position: 1, ttlMs: 60_000, enqueuedAt: 1_000 }]
        }
      })
    }
    expect(leaseRows()).toEqual(before)
    expect(receiptCount()).toBe(2)
  })
})
