import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
import type { LegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type { ResolvedClaudeHomeBinding } from '../../shared/claude-home-binding'
import {
  ClaudeBoundHomeRefusalError,
  assertClaudeBoundHomeUsable,
  type AssertClaudeBoundHomeUsable
} from './claude-bound-home-refusal'
import { sameClaudeConfigDir } from './claude-config-dir-identity'
import { isCustomClaudeConfigDir } from './claude-config-dir-pin'

/** Every acquisition re-proves a bound home and refuses a group binding the chat predates. */
export async function assertClaudeBoundHomeAtAcquisition(input: {
  deps: {
    assertBoundHomeUsable?: AssertClaudeBoundHomeUsable
    readClaudeHomeBinding?: (location: {
      workspaceId: string
      executionHostId: string
    }) => ResolvedClaudeHomeBinding | null
  }
  location: AgentSessionExecutionLocation
  accountHome: LegacyAgentSessionAccountHome
  boundHome: boolean
  childEnv: NodeJS.ProcessEnv
}): Promise<void> {
  const { deps, location, accountHome, childEnv } = input
  // A bound directory deleted or signed out since the create refuses by name rather than spawning
  // an unauthenticated child against whatever the path has become.
  const binding = accountHome.binding
  if (input.boundHome && binding) {
    await (deps.assertBoundHomeUsable ?? assertClaudeBoundHomeUsable)({
      binding: { configDir: accountHome.path, groupId: binding.groupId },
      location: { executionHostId: location.executionHostId, wslDistro: location.wslDistro },
      launchEnv: childEnv
    })
  }
  // A binding the group gained after this chat was created cannot be applied to it — its transcript
  // lives under the home it was pinned to — so the user is told instead of billed to the old account.
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
