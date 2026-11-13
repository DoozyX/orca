import {
  isLegacyAgentSessionAccountHome,
  type AgentSessionAccountHome
} from '../../../../shared/agent-session/lifecycle/agent-session-account-home'
import type { AgentSessionAccountKind } from '../../../../shared/agent-session/agent-session-availability'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import { getClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { claudeRoutedHomeAsync } from '../../../claude-accounts/profiles/routing/claude-profile-routed-home'
import { normalizeCodexRuntimeSelection } from '../../../codex-accounts/account-management/runtime-selection'
import {
  resolveOrcaManagedCodexHomePath,
  getSystemCodexHomePath
} from '../../../codex/configuration/homes/codex-home-paths'
import { resolveAbsoluteDirOverride } from '../../../../shared/absolute-dir-override'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Share account-home resolution between create pins and recordless catalog fingerprints or pickers show another account's models.

export type StructuredClaudeAccountHomeDeps = {
  launchEnv: NodeJS.ProcessEnv
  wslDistro: string | null
  /** `identity` names the selected account before its folder exists; the default checks availability. */
  purpose?: 'identity'
  getClaudeConfigDirectory: (
    target: { runtime: 'host' } | { runtime: 'wsl'; wslDistro: string }
  ) => string | null | undefined
}

export async function resolveStructuredClaudeAccountHomePath(
  deps: StructuredClaudeAccountHomeDeps
): Promise<string> {
  // Why only an account: System default keeps the launch-env and configured homes below.
  const router = deps.wslDistro ? undefined : getClaudeProfileRouter()
  const accountHome = router
    ? await claudeRoutedHomeAsync(router, deps.purpose === 'identity' ? 'identity' : 'checked')
    : null
  if (accountHome) {
    return accountHome
  }
  return (
    deps.launchEnv.CLAUDE_CONFIG_DIR?.trim() ||
    deps
      .getClaudeConfigDirectory(
        deps.wslDistro ? { runtime: 'wsl', wslDistro: deps.wslDistro } : { runtime: 'host' }
      )
      ?.trim() ||
    join(homedir(), '.claude')
  )
}

export type StructuredCodexAccountHomeDeps = {
  launchEnv: NodeJS.ProcessEnv
  /** Resolve create-prepared or side-effect-free read homes identically; null selects env/system defaults. Reads must not sync homes or clear selections. */
  resolveLaunchHome:
    | ((input: { launchEnv: NodeJS.ProcessEnv }) => string | null | Promise<string | null>)
    | null
}

export async function resolveStructuredCodexAccountHomePath(
  deps: StructuredCodexAccountHomeDeps
): Promise<string> {
  // A create has no process yet, so the current selection is what it must follow.
  const resolvedHome = await deps.resolveLaunchHome?.({ launchEnv: deps.launchEnv })
  const configuredHome = deps.launchEnv.CODEX_HOME
  return (
    resolvedHome?.trim() ||
    (deps.resolveLaunchHome ? getSystemCodexHomePath() : configuredHome?.trim()) ||
    getSystemCodexHomePath()
  )
}

/** The home a launch would pin right now, for reads with no session record (the model catalog). */
export async function resolveRecordlessStructuredAgentAccountHome(input: {
  agent: 'claude' | 'codex'
  launchEnv: NodeJS.ProcessEnv
  getClaudeConfigDirectory: StructuredClaudeAccountHomeDeps['getClaudeConfigDirectory']
  resolveCodexLaunchHome: StructuredCodexAccountHomeDeps['resolveLaunchHome']
}): Promise<{ variable: 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME'; path: string }> {
  if (input.agent === 'claude') {
    return {
      variable: 'CLAUDE_CONFIG_DIR',
      path: await resolveStructuredClaudeAccountHomePath({
        launchEnv: input.launchEnv,
        wslDistro: null,
        getClaudeConfigDirectory: input.getClaudeConfigDirectory
      })
    }
  }
  return {
    variable: 'CODEX_HOME',
    // Read-only resolver, never launch prep: a picker mount or discovery read
    // must not sync homes, start bridges, or clear an account selection.
    path: await resolveStructuredCodexAccountHomePath({
      launchEnv: input.launchEnv,
      resolveLaunchHome: input.resolveCodexLaunchHome
    })
  }
}

export function resolveStructuredCodexAccountKind(
  home: string,
  settings: Partial<
    Pick<
      GlobalSettings,
      | 'codexManagedAccounts'
      | 'activeCodexManagedAccountId'
      | 'activeCodexManagedAccountIdsByRuntime'
    >
  >
): AgentSessionAccountKind | undefined {
  const same = (other: string): boolean =>
    normalizeRuntimePathForComparison(home) === normalizeRuntimePathForComparison(other)
  if (
    (settings.codexManagedAccounts ?? []).some(
      (account) => account.managedHomeRuntime !== 'wsl' && same(account.managedHomePath)
    )
  ) {
    return 'managed'
  }
  if (same(getSystemCodexHomePath())) {
    return 'system'
  }
  if (same(resolveOrcaManagedCodexHomePath())) {
    return normalizeCodexRuntimeSelection(settings).host ? 'managed' : 'system'
  }
  return undefined
}

/** Resolve env-configured account home from launch env, runtime env, then user-home default. */
export function resolveStructuredEnvAccountHomePath(input: {
  launchEnv: NodeJS.ProcessEnv
  variable: string
  defaultPath: (homePath: string) => string
  processEnv?: NodeJS.ProcessEnv
  homePath?: string
}): string {
  return resolveAbsoluteDirOverride(
    input.launchEnv[input.variable] ?? (input.processEnv ?? process.env)[input.variable],
    input.defaultPath(input.homePath ?? homedir())
  )
}

/** The account home a create commits: the selected one, re-pinned to where an adopted conversation
 *  lives. The group binding stays only while the committed home is still the bound one. */
export function adoptedStructuredAgentAccountHome(
  selected: AgentSessionAccountHome,
  adopted: AgentSessionAccountHome | undefined
): AgentSessionAccountHome {
  if (adopted === undefined) {
    return selected
  }
  if (
    isLegacyAgentSessionAccountHome(selected) &&
    isLegacyAgentSessionAccountHome(adopted) &&
    selected.binding &&
    adopted.path === selected.path
  ) {
    return { ...adopted, binding: selected.binding }
  }
  return adopted
}
