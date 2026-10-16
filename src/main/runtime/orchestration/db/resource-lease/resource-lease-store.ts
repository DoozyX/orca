import {
  ORCHESTRATION_RESOURCE_LEASE_KEY_MAX_LENGTH,
  ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS,
  type LeaseAcquireResult,
  type LeaseHolder,
  type LeaseReleaseResult,
  type LeaseShowResult,
  type LeaseWaiter
} from '../../../../../shared/rpc-contract/orchestration-lease-params'
import { OrchestrationError } from '../../orchestration-error'
import { runLifecycleWriteTransaction } from '../lifecycle-write-transaction-runner'
import type { OrchestrationDb } from '../orchestration-db'

type ResourceLeaseRow = {
  resource_key: string
  holder_run_id: string
  acquired_at: number
  expires_at: number
}

type ResourceLeaseWaiterRow = {
  resource_key: string
  run_id: string
  position: number
  ttl_ms: number
  enqueued_at: number
}

function assertResourceKey(resourceKey: string): void {
  if (
    resourceKey.length === 0 ||
    resourceKey.length > ORCHESTRATION_RESOURCE_LEASE_KEY_MAX_LENGTH
  ) {
    throw new OrchestrationError(
      'invalid_argument',
      `A resource key must be 1 to ${ORCHESTRATION_RESOURCE_LEASE_KEY_MAX_LENGTH} characters long.`
    )
  }
}

function assertTtlMs(ttlMs: number): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS) {
    throw new OrchestrationError(
      'invalid_argument',
      `A lease TTL must be a whole number of milliseconds from 1 to ${ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS}.`
    )
  }
}

function toHolder(row: ResourceLeaseRow): LeaseHolder {
  return { runId: row.holder_run_id, acquiredAt: row.acquired_at, expiresAt: row.expires_at }
}

function readLease(db: OrchestrationDb, resourceKey: string): ResourceLeaseRow | undefined {
  const row = db.db.prepare('SELECT * FROM resource_leases WHERE resource_key = ?').get(resourceKey)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SELECT * FROM resource_leases returns ResourceLeaseRow columns; the adapter exposes unknown.
  return row as ResourceLeaseRow | undefined
}

function readWaiters(db: OrchestrationDb, resourceKey: string): ResourceLeaseWaiterRow[] {
  const rows = db.db
    .prepare('SELECT * FROM resource_lease_waiters WHERE resource_key = ? ORDER BY position')
    .all(resourceKey)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SELECT * FROM resource_lease_waiters returns ResourceLeaseWaiterRow columns; the adapter exposes unknown.
  return rows as ResourceLeaseWaiterRow[]
}

function removeWaiter(db: OrchestrationDb, waiter: ResourceLeaseWaiterRow): void {
  db.db
    .prepare('DELETE FROM resource_lease_waiters WHERE resource_key = ? AND run_id = ?')
    .run(waiter.resource_key, waiter.run_id)
  db.db
    .prepare(
      'UPDATE resource_lease_waiters SET position = position - 1 WHERE resource_key = ? AND position > ?'
    )
    .run(waiter.resource_key, waiter.position)
}

function mintLease(
  db: OrchestrationDb,
  resourceKey: string,
  runId: string,
  ttlMs: number,
  nowMs: number
): LeaseHolder {
  db.db
    .prepare(
      'INSERT INTO resource_leases (resource_key, holder_run_id, acquired_at, expires_at) VALUES (?, ?, ?, ?)'
    )
    .run(resourceKey, runId, nowMs, nowMs + ttlMs)
  return { runId, acquiredAt: nowMs, expiresAt: nowMs + ttlMs }
}

function promoteHeadWaiter(
  db: OrchestrationDb,
  resourceKey: string,
  nowMs: number
): LeaseHolder | null {
  const [head] = readWaiters(db, resourceKey)
  if (!head) {
    return null
  }
  removeWaiter(db, head)
  return mintLease(db, resourceKey, head.run_id, head.ttl_ms, nowMs)
}

/** The live holder after an expired one, if any, has handed the lease to the head waiter. */
function settleExpiredHolder(
  db: OrchestrationDb,
  resourceKey: string,
  nowMs: number
): ResourceLeaseRow | undefined {
  const lease = readLease(db, resourceKey)
  if (!lease || nowMs < lease.expires_at) {
    return lease
  }
  db.db.prepare('DELETE FROM resource_leases WHERE resource_key = ?').run(resourceKey)
  promoteHeadWaiter(db, resourceKey, nowMs)
  return readLease(db, resourceKey)
}

export function acquireResourceLease(
  this: OrchestrationDb,
  params: { resourceKey: string; runId: string; ttlMs: number; nowMs: number }
): LeaseAcquireResult {
  const { resourceKey, runId, ttlMs, nowMs } = params
  assertResourceKey(resourceKey)
  assertTtlMs(ttlMs)
  return runLifecycleWriteTransaction(this.db, 'resource_lease_acquire', () => {
    const lease = settleExpiredHolder(this, resourceKey, nowMs)
    if (!lease) {
      return { status: 'acquired', holder: mintLease(this, resourceKey, runId, ttlMs, nowMs) }
    }
    if (lease.holder_run_id === runId) {
      this.db
        .prepare('UPDATE resource_leases SET expires_at = ? WHERE resource_key = ?')
        .run(nowMs + ttlMs, resourceKey)
      return { status: 'renewed', holder: { ...toHolder(lease), expiresAt: nowMs + ttlMs } }
    }
    const waiters = readWaiters(this, resourceKey)
    const waiting = waiters.find((waiter) => waiter.run_id === runId)
    if (waiting) {
      return { status: 'queued', position: waiting.position, holder: toHolder(lease) }
    }
    const position = (waiters.at(-1)?.position ?? 0) + 1
    this.db
      .prepare(
        'INSERT INTO resource_lease_waiters (resource_key, run_id, position, ttl_ms, enqueued_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(resourceKey, runId, position, ttlMs, nowMs)
    return { status: 'queued', position, holder: toHolder(lease) }
  })
}

export function releaseResourceLease(
  this: OrchestrationDb,
  params: { resourceKey: string; runId: string; nowMs: number }
): LeaseReleaseResult {
  const { resourceKey, runId, nowMs } = params
  assertResourceKey(resourceKey)
  return runLifecycleWriteTransaction(this.db, 'resource_lease_release', () => {
    const lease = readLease(this, resourceKey)
    // The holder releases even past expiry; settling another's expiry may promote the caller, which then releases too.
    const holder =
      lease?.holder_run_id === runId ? lease : settleExpiredHolder(this, resourceKey, nowMs)
    if (holder?.holder_run_id === runId) {
      this.db.prepare('DELETE FROM resource_leases WHERE resource_key = ?').run(resourceKey)
      return { status: 'released', promoted: promoteHeadWaiter(this, resourceKey, nowMs) }
    }
    const waiting = readWaiters(this, resourceKey).find((waiter) => waiter.run_id === runId)
    if (!waiting) {
      return { status: 'not_held' }
    }
    removeWaiter(this, waiting)
    return { status: 'dequeued' }
  })
}

/** Read-only: an expired holder is reported, and left for the next acquire or release to settle. */
export function showResourceLease(
  this: OrchestrationDb,
  params: { resourceKey: string; nowMs: number }
): LeaseShowResult {
  const { resourceKey, nowMs } = params
  assertResourceKey(resourceKey)
  const lease = readLease(this, resourceKey)
  const waiters: LeaseWaiter[] = readWaiters(this, resourceKey).map((row) => ({
    runId: row.run_id,
    position: row.position,
    ttlMs: row.ttl_ms,
    enqueuedAt: row.enqueued_at
  }))
  const [head] = waiters
  return {
    resourceKey,
    holder: lease ? { ...toHolder(lease), expired: nowMs >= lease.expires_at } : null,
    next: head ? { runId: head.runId, ttlMs: head.ttlMs } : null,
    waiters
  }
}

export type ResourceLeaseStoreMethods = {
  acquireResourceLease: typeof acquireResourceLease
  releaseResourceLease: typeof releaseResourceLease
  showResourceLease: typeof showResourceLease
}

export function attachResourceLeaseStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    acquireResourceLease,
    releaseResourceLease,
    showResourceLease
  })
}
