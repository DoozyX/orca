// A project group's bound Claude home: the router's one override of the account selection.
// It is a user-owned folder (its own login and plugins), so Orca never sets it up, refreshes it
// from ~/.claude, or writes to it; an unusable one refuses by name instead of falling back.

import type { ResolvedClaudeHomeBinding } from '../../shared/claude-home-binding'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  assertClaudeBoundHomeUsable,
  type AssertClaudeBoundHomeUsable
} from '../claude/claude-bound-home-refusal'
import { isCustomClaudeConfigDir } from '../claude/claude-config-dir-pin'
import {
  claudeChildLaunchEnv,
  resolveClaudeHomeBindingForSession,
  type ClaudeHomeBindingCatalogSource
} from '../claude/claude-structured-account-home'
import type { ClaudeEnvPatch } from './environment'
import type { ClaudeRuntimeAuthPreparation } from './runtime-auth/runtime-auth-types'
import type { ClaudeAccountSelectionTarget } from './runtime-selection'

/** What a launch tells the router about itself. Absent means no workspace, so no group. */
export type ClaudeLaunchScope = {
  /** Resolved against the project catalog on this host. */
  workspaceId?: string
  /** Already pinned, as a chat's record pins it at create. */
  boundHome?: ResolvedClaudeHomeBinding
  /** The launch's own env; it may not name a different CLAUDE_CONFIG_DIR. */
  launchEnv?: NodeJS.ProcessEnv
}

/** The router's override: a launch in a bound workspace runs in the group's home, not the selection. */
export type ClaudeBoundHomeOverride = {
  /** Null when unbound. Throws, refusing the launch, when the catalog cannot say. */
  prepareLaunch(scope?: ClaudeLaunchScope): Promise<ClaudeRuntimeAuthPreparation> | null
  /** Null when unbound. Never throws: a pane always opens. */
  terminalEnv(
    target?: ClaudeAccountSelectionTarget,
    scope?: ClaudeLaunchScope
  ): ClaudeEnvPatch | null
}

/** Host launches only: a binding is a path on this machine, never in a WSL guest or over SSH. */
export function createClaudeBoundHomeOverride(
  store: ClaudeHomeBindingCatalogSource,
  assertUsable: AssertClaudeBoundHomeUsable = assertClaudeBoundHomeUsable
): ClaudeBoundHomeOverride {
  const resolve = (scope: ClaudeLaunchScope): ResolvedClaudeHomeBinding | null => {
    if (scope.boundHome) {
      return scope.boundHome
    }
    if (!scope.workspaceId) {
      return null
    }
    // Throws when the catalog cannot answer: "unknown" must not read as "unbound".
    const binding = resolveClaudeHomeBindingForSession({
      store,
      workspaceId: scope.workspaceId,
      executionHostId: LOCAL_EXECUTION_HOST_ID
    })
    // Why Orca's env, not the launch's: a launch an earlier stage already pinned to the binding
    // would otherwise read as unbound. A binding naming Claude's own default pins nothing.
    return binding && isCustomClaudeConfigDir(binding.configDir) ? binding : null
  }
  return {
    prepareLaunch: (scope) => {
      const bound = scope ? resolve(scope) : null
      return bound ? prepareClaudeBoundHomeLaunch(bound, scope?.launchEnv, assertUsable) : null
    },
    terminalEnv: (target, scope) => {
      if (target?.runtime === 'wsl' || !scope) {
        return null
      }
      try {
        const bound = resolve(scope)
        return bound ? { CLAUDE_CONFIG_DIR: bound.configDir } : null
      } catch (error) {
        // Why no pointer: an unknown binding must not route the pane to the selected account.
        console.warn('[claude-profile] Could not read the project group Claude home:', error)
        return {}
      }
    }
  }
}

export async function prepareClaudeBoundHomeLaunch(
  bound: ResolvedClaudeHomeBinding,
  launchEnv?: NodeJS.ProcessEnv,
  assertUsable: AssertClaudeBoundHomeUsable = assertClaudeBoundHomeUsable
): Promise<ClaudeRuntimeAuthPreparation> {
  await assertUsable({
    binding: bound,
    location: { executionHostId: LOCAL_EXECUTION_HOST_ID, wslDistro: null },
    launchEnv: claudeChildLaunchEnv(launchEnv)
  })
  return {
    configDir: bound.configDir,
    runtime: 'host',
    wslDistro: null,
    wslLinuxConfigDir: null,
    envPatch: { CLAUDE_CONFIG_DIR: bound.configDir },
    provenance: `project-group:${bound.groupId}`
  }
}
