import type { CommandHandler } from '../../dispatch'
import { printResult } from '../../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { RuntimeClientError } from '../../runtime-client'
import type {
  LeaseAcquireResult,
  LeaseReleaseResult,
  LeaseShowResult
} from '../../../shared/rpc-contract/orchestration-lease-params'
import { callOrchestrationMutation } from './mutation-request'
import { getOptionalPositiveIntegerValueFlag } from './numeric-flags'
import { resolveCoordinatorTerminalHandle } from './terminal-identity'

async function callLeaseMethod<T>(method: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    // Why: a host older than leases answers method_not_found, which reads as a bug rather than a version gap.
    if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
      throw new RuntimeClientError(
        'incompatible_runtime',
        `This Orca server does not support ${method}. Update Orca on the server to use shared resource leases.`
      )
    }
    throw error
  }
}

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

function renderAcquire(resource: string, value: LeaseAcquireResult): string {
  return value.status === 'queued'
    ? `Queued for ${resource} at position ${value.position}; held by ${value.holder.runId} until ${iso(value.holder.expiresAt)}.`
    : `Holding ${resource} until ${iso(value.holder.expiresAt)}.`
}

function renderRelease(resource: string, value: LeaseReleaseResult): string {
  if (value.status === 'released') {
    return value.promoted
      ? `Released ${resource}; ${value.promoted.runId} holds it until ${iso(value.promoted.expiresAt)}.`
      : `Released ${resource}; no Run is waiting for it.`
  }
  return value.status === 'dequeued'
    ? `Left the queue for ${resource}.`
    : `This Run neither holds nor waits for ${resource}.`
}

function renderShow(value: LeaseShowResult): string {
  const { holder, next } = value
  if (!holder) {
    return `${value.resourceKey} is free.`
  }
  const holderLine = holder.expired
    ? `Held by ${holder.runId}; expired at ${iso(holder.expiresAt)}. ${next ? `The next acquire or release hands it to ${next.runId}.` : 'The next acquire takes it.'}`
    : `Held by ${holder.runId} until ${iso(holder.expiresAt)}.`
  return [
    holderLine,
    ...value.waiters.map(
      (waiter) => `Waiting ${waiter.position}: ${waiter.runId} for ${waiter.ttlMs} ms.`
    )
  ].join('\n')
}

export const ORCHESTRATION_LEASE_HANDLERS: Record<string, CommandHandler> = {
  'orchestration lease acquire': async ({ flags, client, cwd, json }) => {
    const resource = getRequiredStringFlag(flags, 'resource')
    const ttlMs = getOptionalPositiveIntegerValueFlag(flags, 'ttl-ms')
    const run = getOptionalStringFlag(flags, 'run')
    const from = await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const result = await callLeaseMethod('orchestration.leaseAcquire', () =>
      callOrchestrationMutation<LeaseAcquireResult>(client, flags, 'orchestration.leaseAcquire', {
        resource,
        ttlMs,
        run,
        from
      })
    )
    printResult(result, json, (value) => renderAcquire(resource, value))
  },

  'orchestration lease release': async ({ flags, client, cwd, json }) => {
    const resource = getRequiredStringFlag(flags, 'resource')
    const run = getOptionalStringFlag(flags, 'run')
    const from = await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const result = await callLeaseMethod('orchestration.leaseRelease', () =>
      callOrchestrationMutation<LeaseReleaseResult>(client, flags, 'orchestration.leaseRelease', {
        resource,
        run,
        from
      })
    )
    printResult(result, json, (value) => renderRelease(resource, value))
  },

  'orchestration lease show': async ({ flags, client, json }) => {
    const resource = getRequiredStringFlag(flags, 'resource')
    const result = await callLeaseMethod('orchestration.leaseShow', () =>
      client.call<LeaseShowResult>('orchestration.leaseShow', { resource })
    )
    printResult(result, json, renderShow)
  }
}
