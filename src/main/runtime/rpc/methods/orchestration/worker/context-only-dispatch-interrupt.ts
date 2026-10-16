import { computeAgentSessionPayloadFingerprint } from '../../../../../../shared/agent-session-mutation-envelope'
import { getStructuredAgentSessionHost } from '../../../../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { StructuredAgentSessionHost } from '../../../../../native-chat/agent-session-wire/structured-agent-session-host'
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
 * Cancels the turn a structured worker was running when its context-only Dispatch stopped, so it
 * stops acting on the fenced assignment. Undefined for any other assignee, chats included.
 */
export async function interruptContextOnlyStructuredWorker(
  runtime: OrcaRuntimeService,
  dispatch: { id: string; assignee_handle: string | null }
): Promise<StopInterrupt | undefined> {
  const handle = dispatch.assignee_handle
  if (!handle || !isStructuredWorkerHandle(handle)) {
    return undefined
  }
  // Why read before any await: the stop just freed the worker, and once this yields a new Dispatch
  // can take it over and open a turn this cancel must never reach.
  const target = stoppedAssignmentTurn(runtime, handle)
  if ('outcome' in target) {
    return target
  }
  const { host, sessionId, turnId } = target
  try {
    const result = await host.cancel(
      { callerKey: structuredPointerCallerKey(dispatch.id) },
      {
        turnId,
        envelope: {
          sessionId,
          clientOperationId: mintAgentSessionOperationId(Date.now()),
          expectedRuntimeFence: target.runtimeFence,
          payloadFingerprint: computeAgentSessionPayloadFingerprint({
            method: 'agentSession.cancel',
            sessionId,
            fields: { turnId }
          })
        }
      }
    )
    if (!result.ok) {
      return notInterrupted(result.refusal.message)
    }
    // Not cancelled: the named turn ended before the host reached it.
    return { outcome: result.value.cancelled ? 'cancelled' : 'no_running_turn' }
  } catch (error) {
    // Why caught: the stop is already committed, and its receipt must still say what happened.
    return notInterrupted(error instanceof Error ? error.message : String(error))
  }
}

/** The turn the worker runs as its Dispatch stops, or the verdict when there is none to name. */
function stoppedAssignmentTurn(
  runtime: OrcaRuntimeService,
  handle: string
):
  | StopInterrupt
  | { host: StructuredAgentSessionHost; sessionId: string; turnId: string; runtimeFence: number } {
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
  const work = host.currentWork(running.sessionId)
  const turnId = work ? work.activeTurnId() : null
  if (turnId === null) {
    return work !== null && work.working()
      ? notInterrupted("The worker's next turn has not opened yet, so there was no turn to name.")
      : { outcome: 'no_running_turn' }
  }
  return {
    host,
    sessionId: running.sessionId,
    turnId,
    runtimeFence: running.record.lease.runtimeFence
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
