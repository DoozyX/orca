import { z } from 'zod'
import { OptionalString, requiredString } from './rpc-param-primitives'

export const ORCHESTRATION_RESOURCE_LEASE_DEFAULT_TTL_MS = 1_800_000
export const ORCHESTRATION_RESOURCE_LEASE_MAX_TTL_MS = 86_400_000
export const ORCHESTRATION_RESOURCE_LEASE_KEY_MAX_LENGTH = 200

export const LeaseAcquireParams = z.object({
  resource: requiredString('Missing --resource'),
  // Strict: a mistyped TTL must be refused, not absorbed into the default.
  ttlMs: z.number().optional(),
  run: OptionalString,
  from: OptionalString
})

export const LeaseReleaseParams = z.object({
  resource: requiredString('Missing --resource'),
  run: OptionalString,
  from: OptionalString
})

export const LeaseShowParams = z.object({
  resource: requiredString('Missing --resource'),
  from: OptionalString
})

/** Times are epoch milliseconds on the host that owns the orchestration database. */
export type LeaseHolder = { runId: string; acquiredAt: number; expiresAt: number }
export type LeaseShownHolder = LeaseHolder & { expired: boolean }
export type LeaseWaiter = { runId: string; position: number; ttlMs: number; enqueuedAt: number }

export type LeaseAcquireResult =
  | { status: 'acquired' | 'renewed'; holder: LeaseHolder }
  | { status: 'queued'; position: number; holder: LeaseHolder }

export type LeaseReleaseResult =
  | { status: 'released'; promoted: LeaseHolder | null }
  | { status: 'dequeued' | 'not_held' }

export type LeaseShowResult = {
  resourceKey: string
  holder: LeaseShownHolder | null
  /** The head waiter: the Run the next release, or the next mutation after expiry, promotes. */
  next: { runId: string; ttlMs: number } | null
  waiters: LeaseWaiter[]
}
