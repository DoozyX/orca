import type { ParsedAgentStatusPayload } from '../../../shared/agent-status/contracts/agent-status-types'
import type { EnrichedAgentHookEventPayload } from './server-types'

/** What a terminal status row keeps from the row it replaces: provider session and main agent. */
export function carryOverTerminalStatusIdentity(
  previous: EnrichedAgentHookEventPayload | undefined,
  payload: ParsedAgentStatusPayload,
  newRun: boolean
): {
  preservedProviderSession: EnrichedAgentHookEventPayload['providerSession'] | undefined
  preservedMainAgent: ParsedAgentStatusPayload['mainAgent'] | undefined
} {
  // Terminal status carries no provider session; retain eligible cached identity without treating unknown as a mismatch (#10630).
  const claimedAgentType =
    payload.agentType && payload.agentType !== 'unknown' ? payload.agentType : undefined
  // A live agent's turn after `done` keeps its session (OSC 7501 reports hookless slash commands); a new run or an exited agent's resume-only row does not. Launch seeds are not completed turns.
  const preservedProviderSession =
    previous?.providerSession &&
    (claimedAgentType === undefined || claimedAgentType === previous.payload.agentType) &&
    (previous.payload.state !== 'done' ||
      payload.state === 'done' ||
      previous.observation?.origin === 'launch' ||
      (!newRun && previous.providerSessionOnly !== true))
      ? previous.providerSession
      : undefined
  // Without a new main-agent fact, preserve it only while the row's state and agent still match.
  const preservedMainAgent =
    payload.mainAgent ??
    (previous?.payload.mainAgent &&
    previous.payload.state === payload.state &&
    (claimedAgentType === undefined || claimedAgentType === previous.payload.agentType)
      ? previous.payload.mainAgent
      : undefined)
  return { preservedProviderSession, preservedMainAgent }
}
