import { computeAgentSessionPayloadFingerprint } from '../../../../../../shared/agent-session-mutation-envelope'
import { getStructuredAgentSessionHost } from '../../../../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { structuredPointerCallerKey } from '../../../../orchestration/structured-mailbox-pointer-host'
import { mintAgentSessionOperationId } from '../../../../orchestration/structured-pointer-operation-id'
import {
  resolveStructuredWorkerIdentity,
  structuredWorkerSession
} from '../../../../structured-worker-authority'
import { isStructuredWorkerHandle } from '../../../../structured-worker-identity'

export type StopInterrupt = {
  outcome: 'cancelled' | 'no_running_turn' | 'not_interrupted'
  reason?: string
}

/**
 * Cancels the running turn of a structured worker whose context-only Dispatch was just stopped, so
 * it stops acting on the fenced assignment. Undefined for any other assignee, chats included.
 */
export async function interruptContextOnlyStructuredWorker(
  runtime: OrcaRuntimeService,
  dispatch: { id: string; assignee_handle: string | null }
): Promise<StopInterrupt | undefined> {
  const handle = dispatch.assignee_handle
  if (!handle || !isStructuredWorkerHandle(handle)) {
    return undefined
  }
  // After a restart nothing has installed the host the interrupt goes through.
  await runtime.ensureStructuredAgentSessionHost().catch((error: unknown) => {
    console.warn('[orchestration] structured host install failed before interrupt', handle, error)
  })
  const identity = resolveStructuredWorkerIdentity(handle, runtime.getOrchestrationDb())
  if (!identity) {
    return notInterrupted('This runtime has no record of the structured worker.')
  }
  const running = structuredWorkerSession(identity)
  if (running.kind === 'other-host') {
    return notInterrupted('The session running this worker is on another host; interrupt it there.')
  }
  if (running.kind === 'unverifiable') {
    return notInterrupted(running.reason)
  }
  const host = getStructuredAgentSessionHost()
  if (!host) {
    return notInterrupted('The structured agent-session host is not installed in this runtime.')
  }
  const { sessionId } = running
  try {
    const result = await host.cancel(
      { callerKey: structuredPointerCallerKey(dispatch.id) },
      {
        envelope: {
          sessionId,
          clientOperationId: mintAgentSessionOperationId(Date.now()),
          expectedRuntimeFence: running.record.lease.runtimeFence,
          payloadFingerprint: computeAgentSessionPayloadFingerprint({
            method: 'agentSession.cancel',
            sessionId,
            fields: {}
          })
        }
      }
    )
    if (!result.ok) {
      return notInterrupted(result.refusal.message)
    }
    return { outcome: result.value.cancelled ? 'cancelled' : 'no_running_turn' }
  } catch (error) {
    // Why caught: the stop is already committed, and its receipt must still say what happened.
    return notInterrupted(error instanceof Error ? error.message : String(error))
  }
}

export function contextOnlyStopWarning(
  result: { state: string; alreadySettled: boolean; releasedCurrentTask: boolean },
  interrupt: StopInterrupt | undefined
): string {
  if (result.alreadySettled) {
    return `Dispatch was already ${result.state}; no terminal process changed.`
  }
  const stopped = result.releasedCurrentTask
    ? 'The assignment was stopped without closing its unsupervised terminal process.'
    : 'The superseded assignment was stopped without changing the current Task or terminal process.'
  return interrupt?.outcome === 'not_interrupted'
    ? `${stopped} Its turn could not be interrupted, so the worker may still be running: ${interrupt.reason}`
    : stopped
}

function notInterrupted(reason: string): StopInterrupt {
  return { outcome: 'not_interrupted', reason }
}
