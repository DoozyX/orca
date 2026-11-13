import { isAgentStatusHooksEnabledForAgent } from '../../../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'
import { getClaudeAgentViewService } from '../../../claude/agent-view/agent-view-service'
import { probeRecentClaudeCliVersion } from '../../../claude/cli-capabilities/claude-hook-event-versions'
import { resolveClaudeCommand } from '../../../codex-cli/command'
import type { ClaudeProfileDescriptor } from '../claude-profile-paths'
import type { ClaudeProfileSetupReport } from './claude-profile-setup'
import { runClaudeProfileSetupInWorker } from './claude-profile-setup-worker'

/** One account folder's setup, then its agent-view profile once the folder is usable. */
export async function runClaudeProfileSetup(input: {
  dataRoot: string
  profile: ClaudeProfileDescriptor
  userHome: string
  userConfigDir: string | undefined
  settings: Parameters<typeof isAgentStatusHooksEnabledForAgent>[0]
  runSetup?: typeof runClaudeProfileSetupInWorker
}): Promise<ClaudeProfileSetupReport> {
  const { dataRoot, profile } = input
  const hooks = isAgentStatusHooksEnabledForAgent(input.settings, 'claude')
  const claudeVersion = hooks ? await probeRecentClaudeCliVersion(resolveClaudeCommand()) : null
  const report = await (input.runSetup ?? runClaudeProfileSetupInWorker)({
    dataRoot,
    profile,
    userHome: input.userHome,
    userConfigDir: input.userConfigDir,
    hooks,
    claudeVersion: claudeVersion ?? undefined
  })
  if (report.outcome === 'prepared') {
    await getClaudeAgentViewService(dataRoot).prepareProfile(profile.home)
  }
  if (report.outcome === 'refused' || report.warnings.length > 0) {
    console.warn('[claude-profile] Account setup was incomplete:', report)
  }
  return report
}
