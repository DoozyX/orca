import type {
  AgentStatusOrchestrationContext,
  AgentStatusState
} from '../../../shared/agent-status-types'

function isDispatchInFlight(context: AgentStatusOrchestrationContext): boolean {
  return context.dispatchStatus === 'pending' || context.dispatchStatus === 'dispatched'
}

/**
 * A `done` inside an orchestration run is not news by itself: a worker reports through its
 * dispatch, and a coordinator ends a turn every time a worker message wakes it. Only a worker
 * that needs the user and a coordinator with nothing left in flight are worth a banner or push.
 */
export function isQuietOrchestrationCompletion(input: {
  paneKey: string | undefined
  agentState: AgentStatusState | undefined
  orchestrationByPaneKey: Record<string, AgentStatusOrchestrationContext>
}): boolean {
  const { paneKey, agentState, orchestrationByPaneKey } = input
  if (agentState !== 'done' || paneKey === undefined) {
    return false
  }
  const workerContext = orchestrationByPaneKey[paneKey]
  if (workerContext) {
    // Why: absent attention means the runtime projection has not arrived; notify rather than guess.
    const attention = workerContext.attention
    // Why: a flat run makes every task top-level, so `root_completion` would banner every step.
    return attention !== undefined && !attention.requiresAction
  }
  return Object.values(orchestrationByPaneKey).some(
    (context) => context.parentPaneKey === paneKey && isDispatchInFlight(context)
  )
}
