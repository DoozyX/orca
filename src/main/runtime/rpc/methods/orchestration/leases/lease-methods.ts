import { defineMethod } from '../../../core'
import { resolveRunScope } from '../runs/run-scope'
import {
  LeaseAcquireParams,
  LeaseReleaseParams,
  LeaseShowParams,
  ORCHESTRATION_RESOURCE_LEASE_DEFAULT_TTL_MS
} from '../../../../../../shared/rpc-contract/orchestration-lease-params'

export const ORCHESTRATION_LEASE_METHODS = [
  defineMethod({
    name: 'orchestration.leaseAcquire',
    permission: 'workspace',
    params: LeaseAcquireParams,
    handler: (
      params,
      { orchestrationCompatibilityEvidence, orchestrationCaller, runtime, legacyCoordinatorRunId }
    ) => {
      const run = resolveRunScope(runtime, {
        runId: params.run,
        callerTerminalHandle: params.from,
        requireCurrentConsumer: true,
        legacyCoordinatorRunId,
        callerEvidence: orchestrationCompatibilityEvidence,
        callerSession: orchestrationCaller
      })
      return runtime.getOrchestrationDb().acquireResourceLease({
        resourceKey: params.resource,
        runId: run.id,
        ttlMs: params.ttlMs ?? ORCHESTRATION_RESOURCE_LEASE_DEFAULT_TTL_MS,
        nowMs: Date.now()
      })
    }
  }),

  defineMethod({
    name: 'orchestration.leaseRelease',
    permission: 'workspace',
    params: LeaseReleaseParams,
    handler: (
      params,
      { orchestrationCompatibilityEvidence, orchestrationCaller, runtime, legacyCoordinatorRunId }
    ) => {
      const run = resolveRunScope(runtime, {
        runId: params.run,
        callerTerminalHandle: params.from,
        requireCurrentConsumer: true,
        legacyCoordinatorRunId,
        callerEvidence: orchestrationCompatibilityEvidence,
        callerSession: orchestrationCaller
      })
      return runtime.getOrchestrationDb().releaseResourceLease({
        resourceKey: params.resource,
        runId: run.id,
        nowMs: Date.now()
      })
    }
  }),

  // Why no Run scope: anyone may see who holds a resource, and reading it settles nothing.
  defineMethod({
    name: 'orchestration.leaseShow',
    permission: 'workspace',
    params: LeaseShowParams,
    handler: (params, { runtime }) =>
      runtime
        .getOrchestrationDb()
        .showResourceLease({ resourceKey: params.resource, nowMs: Date.now() })
  })
]
