import { join } from 'node:path'
import type { ClaudeAccountRecipe } from '../../../../shared/agent-session/lifecycle/agent-session-acquired-account'
import type { ResolvedClaudeHomeBinding } from '../../../../shared/claude-home-binding'
import { prepareClaudeBoundHomeLaunch } from '../../../claude-accounts/claude-bound-home-route'
import { applyClaudeEnvPatch } from '../../../claude-accounts/environment'
import type { ClaudeProfileRouter } from '../../../claude-accounts/claude-profile-router'
import { AgentSessionPreSpawnError } from '../../../native-chat/agent-session-wire/structured-agent-session-adapter-errors'
import { resolveSessionFilePath } from '../../../native-chat/session-file-resolver'
import type { AssertClaudeBoundHomeUsable } from '../../claude-bound-home-refusal'
import { prepareClaudeLaunchAccount } from '../../claude-launch-account'

/** A bound home is re-proved and recorded as a system-route recipe; otherwise the current account selection is prepared. */
export async function prepareBoundAccount(
  router: ClaudeProfileRouter | undefined,
  env: Record<string, string>,
  recordHome: string,
  bound: Parameters<typeof resolveClaudeStructuredLaunchHome>[3]
): Promise<ClaudeAccountRecipe> {
  if (bound?.boundHome) {
    const home = await resolveClaudeStructuredLaunchHome(router, env, recordHome, bound)
    return { route: 'system', home, configDir: home }
  }
  return prepareClaudeLaunchAccount(router, env, recordHome)
}

/** Follow the current account selection and pin its environment for this launch. */
export async function resolveClaudeStructuredLaunchHome(
  router: ClaudeProfileRouter | undefined,
  env: Record<string, string>,
  recordHome: string,
  bound: {
    boundHome?: ResolvedClaudeHomeBinding
    launchEnv?: NodeJS.ProcessEnv
    assertUsable?: AssertClaudeBoundHomeUsable
  } = {}
): Promise<string> {
  const { boundHome, launchEnv, assertUsable } = bound
  if (boundHome) {
    // Why: a bound home is re-proved every acquisition; it may have been deleted or signed out since.
    const preparation = router
      ? await router.prepareLaunch({ boundHome, launchEnv })
      : await prepareClaudeBoundHomeLaunch(boundHome, launchEnv, assertUsable)
    applyClaudeEnvPatch(env, preparation.envPatch)
    return preparation.configDir
  }
  return (await prepareClaudeLaunchAccount(router, env, recordHome)).home
}

async function claudeTranscriptExists(input: {
  providerSessionId: string
  claudeConfigDir: string
}): Promise<boolean> {
  const path = await resolveSessionFilePath('claude', input.providerSessionId, {
    claudeProjectsDir: join(input.claudeConfigDir, 'projects')
  })
  return path !== null
}

/** A stored leaf implies resume; refuse known history in another account instead of starting fresh. */
export async function claudeLaunchResumesTranscript(input: {
  router: ClaudeProfileRouter | undefined
  leafUuid: string | null
  providerSessionId: string
  claudeConfigDir: string
  recordHome: string
  hasTranscript?: typeof claudeTranscriptExists
}): Promise<boolean> {
  const { router, providerSessionId, claudeConfigDir } = input
  if (!router && input.leafUuid !== null) {
    return true
  }
  const hasTranscript = input.hasTranscript ?? claudeTranscriptExists
  if (await hasTranscript({ providerSessionId, claudeConfigDir })) {
    return true
  }
  if (input.leafUuid === null) {
    return false
  }
  const otherHomes = router
    ? [input.recordHome, ...router.accountHomes(), router.systemDefaultHome()]
    : []
  for (const home of otherHomes.filter((home) => home !== claudeConfigDir)) {
    if (await hasTranscript({ providerSessionId, claudeConfigDir: home })) {
      throw new AgentSessionPreSpawnError(
        new Error('claude transcript is not in the selected account'),
        { reason: 'historyInOtherAccount' }
      )
    }
  }
  // A stored leaf still requires resume when its transcript folder is no longer known.
  return true
}
