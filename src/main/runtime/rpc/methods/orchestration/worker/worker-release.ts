import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { WorkerTerminalTakeoverSource } from '../../../../orchestration/worker-terminal-ownership'
import { defineMethod } from '../../../core'
import { releaseFederatedWorker } from '../federation/federated-worker-release'
import { ORCHESTRATION_WORKER_LIST_METHOD } from './worker-list-method'
import { resolvePinnedFederatedServer } from './worker-observation'
import { archiveSummary, completeWorkerTerminalRelease } from './worker-release-completion'
import { retainedReleaseGuidance, type WorkerReleaseReceipt } from './worker-release-receipt'
import {
  WorkerDispatchParams,
  WorkerRetainParams
} from '../../../../../../shared/rpc-contract/orchestration-worker-release-schemas-params'
import { OrchestrationWorkerTerminalUserInputParams } from '../../../../../../shared/rpc-contract/orchestration-worker-release-params'
import { assertWorkerDispatchInRun } from './worker-dispatch-run-guard'

export const ORCHESTRATION_WORKER_RELEASE_METHODS = [
  defineMethod({
    name: 'orchestration.workerRelease',
    permission: 'workspace',
    params: WorkerDispatchParams,
    handler: async (params, { runtime, orchestrationMutation }): Promise<WorkerReleaseReceipt> => {
      const db = runtime.getOrchestrationDb()
      assertWorkerDispatchInRun(db, params.dispatch, params.run)
      const federated = db.getFederatedDispatch(params.dispatch)
      if (federated) {
        if (!orchestrationMutation) {
          throw new OrchestrationError(
            'invalid_argument',
            'Remote worker-release requires a durable retry request.'
          )
        }
        return releaseFederatedWorker({
          runtime,
          server: resolvePinnedFederatedServer(runtime, federated),
          federated,
          dispatchId: params.dispatch,
          requestId: orchestrationMutation.requestId
        })
      }
      const requested = db.requestWorkerTerminalRelease(params.dispatch)
      // A former owner's release acts through the Dispatch that owns the terminal now.
      const actingDispatchId = requested.resolvedDispatchId ?? params.dispatch
      const resolved = requested.resolvedDispatchId
        ? { resolvedDispatchId: requested.resolvedDispatchId }
        : {}
      if (requested.disposition === 'already_released') {
        return {
          dispatchId: params.dispatch,
          state: 'already_released',
          processAction: 'none',
          archive: archiveSummary(requested.resource),
          ...resolved
        }
      }
      if (requested.disposition === 'retained') {
        const resource = requested.resource
        const processIncarnation = resource?.process_incarnation
        if (
          processIncarnation &&
          (await runtime.inspectTerminalProcessIncarnationLiveness(
            processIncarnation,
            resource.host_scope
          )) === 'exited'
        ) {
          const reconciled = db.settleDeadWorkerTerminalRelease({
            requestingDispatchId: actingDispatchId,
            resourceId: resource.id,
            processIncarnation
          })
          if (reconciled.disposition === 'released') {
            runtime.notifyMessageArrived(`dispatch:${actingDispatchId}`, 'status')
            return {
              dispatchId: params.dispatch,
              state: 'released',
              processAction: 'none',
              archive: archiveSummary(reconciled.resource),
              ...resolved
            }
          }
        }
        return {
          dispatchId: params.dispatch,
          state: 'retained',
          reason: requested.reason,
          processAction: 'none',
          archive: archiveSummary(resource),
          ...resolved,
          ...retainedReleaseGuidance(db, {
            dispatchId: params.dispatch,
            resource,
            currentOwner: requested.currentOwner
          })
        }
      }
      const receipt = await completeWorkerTerminalRelease({
        runtime,
        db,
        dispatchId: actingDispatchId,
        resource: requested.resource
      })
      return { ...receipt, dispatchId: params.dispatch, ...resolved }
    }
  }),
  defineMethod({
    name: 'orchestration.workerRetain',
    permission: 'workspace',
    params: WorkerRetainParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const retained = db.retainWorkerTerminalResource(params.dispatch)
      if (retained.disposition === 'already_released') {
        return {
          dispatchId: params.dispatch,
          state: 'already_released' as const,
          processAction: 'none' as const,
          archive: archiveSummary(retained.resource)
        }
      }
      if (retained.disposition === 'no_owned_resource') {
        return {
          dispatchId: params.dispatch,
          state: 'retained' as const,
          reason: 'no_owned_resource' as const,
          processAction: 'none' as const,
          archive: null
        }
      }
      if (retained.disposition === 'release_committed') {
        const unknown = retained.resource.release_state === 'unknown'
        return {
          dispatchId: params.dispatch,
          state: unknown ? ('release_unknown' as const) : ('release_pending' as const),
          processAction: 'none' as const,
          archive: archiveSummary(retained.resource),
          ...(retained.resource.release_error
            ? { lastError: retained.resource.release_error }
            : {}),
          recovery:
            'Terminal release was already committed and could not be changed to retained; inspect worker-show before taking further action.'
        }
      }
      return {
        dispatchId: params.dispatch,
        state: 'retained' as const,
        reason: 'user_requested' as const,
        processAction: 'none' as const,
        archive: archiveSummary(retained.resource)
      }
    }
  }),
  ORCHESTRATION_WORKER_LIST_METHOD,
  defineMethod({
    name: 'orchestration.workerTerminalUserInput',
    permission: 'workspace',
    // `sessionId` addresses a worker that IS a structured agent session. Its pane key is a random
    // identity credential that never leaves main, so the caller names the session and the owning
    // runtime resolves it — a renderer echoing the pane key back would make it learnable.
    params: OrchestrationWorkerTerminalUserInputParams,
    // Real user keystrokes durably relinquish orchestration ownership on the owning runtime, so
    // restarts, SSH drops, remote viewing, and renderer remounts cannot erase the takeover.
    handler: (params, { runtime }) => {
      // A structured worker reports by session id; it has no pane of its own to name.
      const paneKey =
        params.paneKey ??
        (params.sessionId
          ? runtime.getStructuredWorkerPaneKeyForSession(params.sessionId)
          : runtime.getTerminalPaneKey(params.terminal!))
      // Same precedence as the pane key: desktop PTYs name the pane, structured sessions the
      // session, and mobile the terminal handle.
      const source: WorkerTerminalTakeoverSource = params.paneKey
        ? 'desktop_terminal_input'
        : params.sessionId
          ? 'structured_session_input'
          : 'remote_terminal_input'
      const changed = paneKey
        ? runtime.getOrchestrationDb().markWorkerTerminalUserOwned(paneKey, { source })
        : 0
      return { changed }
    }
  })
]
