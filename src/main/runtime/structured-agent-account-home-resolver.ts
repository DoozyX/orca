import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
import type { AgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type { StructuredAgentId } from '../../shared/agent-session-provider-handle'
import {
  structuredAgentRuntimeRegistration,
  type StructuredAgentAccountHomeServices
} from './structured-agent-runtime-registrations'

/** Where a launch of `agent` finds its account, resolved on this host by the agent's own
 *  registration; null for an agent this runtime does not register, whose create is refused. */
export function structuredAgentAccountHomeResolver(input: {
  agent: StructuredAgentId
  purpose: 'launch' | 'read'
  services: StructuredAgentAccountHomeServices
  /** The launch's workspace directory on this host; unused by a read. */
  launchDirectory: () => Promise<string>
}):
  | ((context: {
      launchEnv: NodeJS.ProcessEnv
      location: AgentSessionExecutionLocation | null
    }) => Promise<AgentSessionAccountHome>)
  | null {
  const registration = structuredAgentRuntimeRegistration(input.agent)
  if (!registration) {
    return null
  }
  return async ({ launchEnv, location }) =>
    registration.resolveAccountHome(
      {
        launchEnv,
        location,
        purpose: input.purpose,
        workspacePath: input.purpose === 'launch' ? input.launchDirectory : null
      },
      input.services
    )
}
