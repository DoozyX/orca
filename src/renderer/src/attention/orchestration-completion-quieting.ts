import type {
  AgentStatusOrchestrationContext,
  AgentStatusState
} from '../../../shared/agent-status-types'
import { isOrchestrationFleetActionCategory } from '../../../shared/orchestration-fleet-attention'

function isDispatchInFlight(context: AgentStatusOrchestrationContext): boolean {
  return context.dispatchStatus === 'pending' || context.dispatchStatus === 'dispatched'
}

export type OrchestrationCompletionInput = {
  paneKey: string | undefined
  agentState: AgentStatusState | undefined
  orchestrationByPaneKey: Record<string, AgentStatusOrchestrationContext>
  announcedFailedDispatchIds: ReadonlySet<string>
  /** Panes past the display window whose run is still coordinated from a live pane. */
  runWorkerPaneKeys: Readonly<Record<string, true>>
}

export type OrchestrationCompletionBanner =
  | { quiet: true }
  | {
      quiet: false
      /** Recorded on delivery so later turns in the pane do not repeat the failure. */
      announcesFailedDispatchId?: string
    }

const QUIET: OrchestrationCompletionBanner = { quiet: true }
const DELIVER: OrchestrationCompletionBanner = { quiet: false }

/**
 * A `done` inside an orchestration run is not news by itself: a worker reports through its
 * dispatch, and a coordinator ends a turn every time a worker message wakes it. Only a worker
 * that needs the user and a coordinator with nothing left in flight are worth a banner or push.
 */
export function resolveOrchestrationCompletionBanner(
  input: OrchestrationCompletionInput
): OrchestrationCompletionBanner {
  const {
    paneKey,
    agentState,
    orchestrationByPaneKey,
    announcedFailedDispatchIds,
    runWorkerPaneKeys
  } = input
  if (agentState !== 'done' || paneKey === undefined) {
    return DELIVER
  }
  const workerContext = orchestrationByPaneKey[paneKey]
  if (workerContext) {
    // Why: absent attention means the runtime projection has not arrived; notify rather than guess.
    const attention = workerContext.attention
    if (attention === undefined) {
      return DELIVER
    }
    // Why: a flat run makes every task top-level, so `root_completion` would banner every step.
    const userAttention = attention.categories.filter(
      // Why: guidance is a coordinator message the worker has yet to ack; the user owes nothing.
      (category) => category !== 'guidance' && isOrchestrationFleetActionCategory(category)
    )
    if (userAttention.length === 0) {
      return QUIET
    }
    if (!userAttention.includes('failure')) {
      return DELIVER
    }
    // Why: a failed dispatch never recovers (a retry is a new dispatch), so one banner covers it.
    if (
      userAttention.every((category) => category === 'failure') &&
      announcedFailedDispatchIds.has(workerContext.dispatchId)
    ) {
      return QUIET
    }
    return { quiet: false, announcesFailedDispatchId: workerContext.dispatchId }
  }
  // Why: the display window drops a settled worker long before its run ends.
  if (runWorkerPaneKeys[paneKey]) {
    return QUIET
  }
  return Object.values(orchestrationByPaneKey).some(
    (context) => context.parentPaneKey === paneKey && isDispatchInFlight(context)
  )
    ? QUIET
    : DELIVER
}
