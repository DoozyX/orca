import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
import type { LegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type { ResolvedClaudeHomeBinding } from '../../shared/claude-home-binding'
import { ClaudeBoundHomeRefusalError } from './claude-bound-home-refusal'
import { sameClaudeConfigDir } from './claude-config-dir-identity'
import { isCustomClaudeConfigDir } from './claude-config-dir-pin'

/**
 * A binding the group gained after this chat was created cannot be applied to it — its transcript
 * lives under the home it was pinned to — so the user is told instead of billed to another account.
 */
export function assertClaudeChatPredatesNoBinding(input: {
  deps: {
    readClaudeHomeBinding?: (location: {
      workspaceId: string
      executionHostId: string
    }) => ResolvedClaudeHomeBinding | null
  }
  location: AgentSessionExecutionLocation
  accountHome: LegacyAgentSessionAccountHome
  childEnv: NodeJS.ProcessEnv
}): void {
  const { deps, location, accountHome, childEnv } = input
  const groupBinding = deps.readClaudeHomeBinding?.({
    workspaceId: location.workspaceId,
    executionHostId: location.executionHostId
  })
  if (
    groupBinding &&
    isCustomClaudeConfigDir(groupBinding.configDir, { env: childEnv }) &&
    !sameClaudeConfigDir(groupBinding.configDir, accountHome.path)
  ) {
    throw new ClaudeBoundHomeRefusalError({
      code: 'claude_bound_home_predates_binding',
      groupId: groupBinding.groupId,
      configDir: groupBinding.configDir,
      accountHomePath: accountHome.path
    })
  }
}
