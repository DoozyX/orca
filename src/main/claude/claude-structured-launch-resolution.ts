import { activeProviderContext } from '../../shared/agent-session-provider-context'
import type { ExecutionHostId } from '../../shared/execution-host'
import { getClaudeProfileRouter } from '../claude-accounts/claude-profile-installed-router'
import { requireLegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type {
  Options as ClaudeAgentSdkOptions,
  PermissionMode
} from '@anthropic-ai/claude-agent-sdk'
import type { AgentChatPermissionMode } from '../../shared/agent-chat-permission-mode'
import {
  agentSessionProviderHandleKey,
  agentSessionProviderHandleRoot
} from '../../shared/agent-session-provider-handle'
import { claudeProviderHandleLeafUuid } from '../../shared/agent-session-provider-handle-encoding'
import type { ClaudeStructuredAuthPolicy } from '../claude-accounts/claude-structured-auth-policy'
import {
  claudeChildEnv,
  claudeProbeEnv,
  resolveClaudeChildEnvSources,
  type ClaudeChildEnvSources,
  type ClaudeEnvDeps
} from './claude-structured-child-env'
import { claudeStructuredLaunchArgs } from './claude-structured-launch-args'
import type { ClaudeCliFlagSupport } from './claude-cli-flag-support'
import { resolveClaudeLaunchFlags } from './claude-structured-launch-flags'
import { withNativeChatVisualsEnv } from '../native-chat/native-chat-visuals-delivery'
import {
  claudeLaunchResumesTranscript,
  resolveClaudeStructuredLaunchHome
} from './claude-structured-launch-home'
import type { StructuredAgentLaunchPartResolver } from '../runtime/structured-agent-launch-composition'
import { claudeSessionIdForOrcaSession } from './claude-structured-session-id'
import type { ResolvedClaudeHomeBinding } from '../../shared/claude-home-binding'
import type { AssertClaudeBoundHomeUsable } from './claude-bound-home-refusal'
import { assertClaudeChatPredatesNoBinding } from './claude-structured-bound-home-checks'
import { claudeChildLaunchEnv, isEffectiveBoundClaudeHome } from './claude-structured-account-home'
import {
  pendingAgentSessionRewindFork,
  type AgentSessionRewindFork
} from '../../shared/agent-session-rewind'

export { claudeSessionIdForOrcaSession }

export const CLAUDE_DEFAULT_SETTING_SOURCES = ['user', 'project', 'local'] as const
export const CLAUDE_SESSION_STATE_EVENTS_ENV = 'CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS'

export type ClaudeStructuredSdkOptions = Pick<
  ClaudeAgentSdkOptions,
  | 'includePartialMessages'
  | 'systemPrompt'
  | 'settingSources'
  | 'supportedDialogKinds'
  | 'extraArgs'
  | 'additionalDirectories'
  | 'plugins'
  | 'model'
  | 'effort'
  | 'permissionMode'
  | 'allowDangerouslySkipPermissions'
  | 'settings'
  | 'sessionId'
  | 'resume'
  | 'resumeSessionAt'
  | 'forkSession'
>

/** Replay acknowledgements require an explicit flag; the SDK supplies the other transport flags. */
export const CLAUDE_STRUCTURED_BASE_OPTIONS: ClaudeStructuredSdkOptions = {
  includePartialMessages: true,
  // Keep the SDK on Claude Code's own system-prompt contract.
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  settingSources: [...CLAUDE_DEFAULT_SETTING_SOURCES],
  supportedDialogKinds: [],
  extraArgs: { 'replay-user-messages': null }
}

const CLAUDE_PERMISSION_MODES = {
  // Override settings defaultMode so the chat runs with its selected permission mode.
  ask: 'default',
  'accept-edits': 'acceptEdits',
  auto: 'auto'
} as const satisfies Record<Exclude<AgentChatPermissionMode, 'full-access'>, PermissionMode>

/** Full access is the owned CLI flag: the SDK's typed bypass emits a flag older binaries reject. */
export function claudeStructuredPermissionOptions(
  mode: AgentChatPermissionMode
): Pick<ClaudeStructuredSdkOptions, 'permissionMode' | 'extraArgs'> {
  return mode === 'full-access'
    ? { extraArgs: { 'dangerously-skip-permissions': null } }
    : { permissionMode: CLAUDE_PERMISSION_MODES[mode] }
}

export type ClaudeStructuredLaunch = {
  /** Always Orca's resolved user CLI: the SDK's bundled binaries are excluded from the install. */
  pathToClaudeCodeExecutable: string
  account?: ClaudeStructuredInvocation['account']
  options: ClaudeStructuredSdkOptions
  cwd: string
  env?: Record<string, string>
  envToDelete?: readonly string[]
  claudeConfigDir: string
  providerSessionId: string
  /** The previous head leaf, carried into the publication link; never a resume argument. */
  resumeLeafUuid: string | null
  /** Whether this launch resumes an existing Claude transcript. */
  resumesTranscript: boolean
  /** Chain identity is independent of whether a transcript exists to resume. */
  continuesChain: boolean
  /** Chain head replaced by this rewind fork. */
  forkedFromKey?: string
}

export type ClaudeStructuredLaunchPartDeps = {
  resolveLaunchArgs: () => Promise<string[]> | string[]
  resolveCommand?: ClaudeEnvDeps['resolveCommand']
  /** Explicit policy identifies the account for sign-in errors; use claudeStructuredAuthPolicyForSettings. */
  resolveAuthPolicy: () => Promise<ClaudeStructuredAuthPolicy> | ClaudeStructuredAuthPolicy
  /** Re-proves a bound home per acquisition when no router is installed. Overridden by tests. */
  assertBoundHomeUsable?: AssertClaudeBoundHomeUsable
  /** The binding the workspace's group carries now; a chat created before it refuses by name.
   *  Absent leaves the check off, for embedders with no project catalog. */
  readClaudeHomeBinding?: (location: {
    workspaceId: string
    executionHostId: ExecutionHostId
  }) => ResolvedClaudeHomeBinding | null
  /** The host's chat attachment store: files a client attached live there, outside the workspace,
   *  and the agent reads them without asking. */
  attachmentDirectory?: string
  /** Omit version-gated flags when support cannot be checked. */
  cliFlags?: Pick<ClaudeCliFlagSupport, 'supports'>
  /** Whether Claude wrote a transcript for this id; defaults to the transcript resolver. */
  hasTranscript?: (input: {
    providerSessionId: string
    claudeConfigDir: string
  }) => Promise<boolean>
}

export type ClaudeStructuredInvocation = {
  command: string
  env: Record<string, string>
  account: 'managed' | 'system'
}

/** Share binary/env resolution with catalog probes; inherited env drift heals on refresh. */
export async function resolveClaudeStructuredInvocation(
  deps: ClaudeEnvDeps & Pick<ClaudeStructuredLaunchPartDeps, 'resolveAuthPolicy'>,
  decorateEnv: (env: Record<string, string>) => Record<string, string> = (env) => env,
  /** Already resolved by a caller that needed them earlier; read again otherwise. */
  resolvedSources?: ClaudeChildEnvSources,
  options?: Parameters<typeof claudeChildEnv>[2]
): Promise<ClaudeStructuredInvocation> {
  const sources = resolvedSources ?? (await resolveClaudeChildEnvSources(deps))
  const auth = await deps.resolveAuthPolicy()
  // Preserve proxy credentials alongside ANTHROPIC_BASE_URL for every account.
  return {
    command: sources.command,
    env: claudeChildEnv(sources, decorateEnv, options),
    account: auth.account
  }
}

export function claudeStructuredLaunchPart(
  deps: ClaudeStructuredLaunchPartDeps
): StructuredAgentLaunchPartResolver<ClaudeStructuredLaunch> {
  return async (basis, identity) => {
    const { record } = basis
    const accountHome = requireLegacyAgentSessionAccountHome(record.accountHome)
    const router = getClaudeProfileRouter()
    // Why the child's whole env: an ambient CLAUDE_CONFIG_DIR reaches the CLI whether or not the overlay names one.
    const childEnv = claudeChildLaunchEnv(basis.launchEnv())
    // A group-bound chat keeps the home pinned at create, as its transcript lives there.
    const boundHome =
      accountHome.binding && isEffectiveBoundClaudeHome(accountHome, { env: childEnv })
        ? { configDir: accountHome.path, groupId: accountHome.binding.groupId }
        : undefined
    if (!boundHome) {
      assertClaudeChatPredatesNoBinding({ deps, location: record.location, accountHome, childEnv })
    }
    // A Claude record's chain holds only Claude handles; the launch admission refuses anything else.
    const active = activeProviderContext(record)
    const head = active.head?.handle ?? null
    if (
      head &&
      (!identity.providerHandle ||
        agentSessionProviderHandleRoot(identity.providerHandle) !==
          agentSessionProviderHandleRoot(head))
    ) {
      throw new Error('claude durable resume identity changed before spawn')
    }
    const fork = pendingAgentSessionRewindFork(record.rewind, head?.nativeId)
    const providerSessionId = fork
      ? fork.sessionId
      : head
        ? head.nativeId
        : claudeSessionIdForOrcaSession(
            identity.sessionId,
            active.pendingClear ? record.providerContextBoundary?.operationId : undefined
          )
    const continuesChain = head?.nativeId === providerSessionId
    const cwd = await basis.launchDirectory()
    const envDeps: ClaudeEnvDeps & Pick<ClaudeStructuredLaunchPartDeps, 'resolveAuthPolicy'> = {
      ...(deps.resolveCommand ? { resolveCommand: deps.resolveCommand } : {}),
      resolveEnv: () => basis.launchEnv(),
      resolveInheritedEnv: basis.baseEnvironment,
      refreshEnvironmentAfterMiss: basis.refreshAfterMissingProgram,
      resolveWorkingDirectory: () => cwd,
      resolveAuthPolicy: deps.resolveAuthPolicy
    }
    const sources = await resolveClaudeChildEnvSources(envDeps)
    // Overlap the version probe with remaining launch preparation.
    const probeLaunch = { command: sources.command, cwd, env: claudeProbeEnv(sources) }
    const launchFlags = resolveClaudeLaunchFlags(
      { ...(deps.cliFlags ? { cliFlags: deps.cliFlags } : {}), prepareVisuals: basis.visuals },
      record.sessionId,
      probeLaunch
    )
    const configured = claudeStructuredLaunchArgs(await deps.resolveLaunchArgs())
    const { thinkingDisplayArgs, visuals } = await launchFlags
    const additionalDirectories = [
      ...configured.additionalDirectories,
      ...(deps.attachmentDirectory ? [deps.attachmentDirectory] : []),
      ...(visuals ? [visuals.visuals.folder] : [])
    ]
    const permission = claudeStructuredPermissionOptions(basis.permissionMode ?? 'ask')
    // --resume fails without a transcript; --session-id collides with an existing one.
    const leafUuid = head && continuesChain ? claudeProviderHandleLeafUuid(head) : null
    const resumes = async (claudeConfigDir: string): Promise<boolean> =>
      (head !== null || active.pendingClear) &&
      (await claudeLaunchResumesTranscript({
        router: boundHome ? undefined : router,
        leafUuid,
        providerSessionId,
        claudeConfigDir,
        hasTranscript: deps.hasTranscript
      }))
    // Why: without a router the home is fixed, so check it before the recheck that must stay last.
    const resumedWithoutRouter = router && !boundHome ? undefined : await resumes(accountHome.path)
    // Last: it rechecks the account switch, which may have begun during any await above.
    const { command, env, account } = await resolveClaudeStructuredInvocation(
      envDeps,
      (base) =>
        withNativeChatVisualsEnv(
          {
            ...base,
            // The turn translator relies on Claude's authoritative idle frame when no result arrives.
            [CLAUDE_SESSION_STATE_EVENTS_ENV]: '1'
          },
          visuals?.visuals ?? null
        ),
      sources,
      { runtimeOnPath: false }
    )
    const launchHome = await resolveClaudeStructuredLaunchHome(router, env, accountHome.path, {
      boundHome,
      launchEnv: childEnv,
      assertUsable: deps.assertBoundHomeUsable
    })
    const resumesTranscript = resumedWithoutRouter ?? (await resumes(launchHome))
    if (fork?.throughEntryId && !resumesTranscript) {
      // Fork sources must pass the same account-history check as resumes.
      await claudeLaunchResumesTranscript({
        router: boundHome ? undefined : router,
        leafUuid: fork.throughEntryId,
        providerSessionId: fork.sourceSessionId,
        claudeConfigDir: launchHome,
        hasTranscript: deps.hasTranscript
      })
    }
    return {
      launch: {
        pathToClaudeCodeExecutable: command,
        account,
        options: {
          ...CLAUDE_STRUCTURED_BASE_OPTIONS,
          ...permission,
          ...(additionalDirectories.length ? { additionalDirectories } : {}),
          ...(visuals?.pluginDir ? { plugins: [{ type: 'local', path: visuals.pluginDir }] } : {}),
          extraArgs: {
            ...configured.extraArgs,
            ...CLAUDE_STRUCTURED_BASE_OPTIONS.extraArgs,
            ...permission.extraArgs,
            ...thinkingDisplayArgs
          },
          // Claude owns where a resumed conversation continues; the stored leaf is Orca's bookkeeping.
          ...(resumesTranscript
            ? { resume: providerSessionId }
            : { sessionId: providerSessionId, ...(fork ? claudeRewindForkOptions(fork) : {}) })
        },
        claudeConfigDir: launchHome,
        providerSessionId,
        resumeLeafUuid: resumesTranscript ? leafUuid : null,
        resumesTranscript,
        continuesChain,
        ...(fork && head && !continuesChain
          ? { forkedFromKey: agentSessionProviderHandleKey(head) }
          : {})
      },
      env,
      inheritedEnvToDelete: [],
      // The agent runtime follows Orca's CLI directory on PATH so another orca cannot shadow it.
      cliRuntimeCommand: command
    }
  }
}

/** Until Claude writes the rewind's session, each launch forks it from the kept conversation. */
function claudeRewindForkOptions(
  fork: AgentSessionRewindFork
): Pick<ClaudeStructuredSdkOptions, 'resume' | 'resumeSessionAt' | 'forkSession'> {
  return fork.throughEntryId
    ? { resume: fork.sourceSessionId, resumeSessionAt: fork.throughEntryId, forkSession: true }
    : {}
}
