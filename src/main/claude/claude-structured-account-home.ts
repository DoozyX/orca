// Which credential directory a structured Claude child launches against.
//
// Kept out of the runtime class files because those are `@ts-nocheck`, for the reason
// `structured-agent-session-history-adoption.ts` already states: a call site written there would
// compile however wrong it was, and the wrong answer here is another organisation's account.

import type { ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import {
  resolveClaudeHomeBindingForWorkspace,
  type ResolvedClaudeHomeBinding
} from '../../shared/claude-home-binding'
import {
  assertClaudeBoundHomeUsable,
  type AssertClaudeBoundHomeUsable
} from './claude-bound-home-refusal'
import { isCustomClaudeConfigDir } from './claude-config-dir-pin'
import {
  resolveStructuredClaudeAccountHomePath,
  type StructuredClaudeAccountHomeDeps
} from '../runtime/structured-agent-account-home'

/** The store accessors the binding decision reads. Each is optional only so a missing one can be
 *  *detected*; see `readClaudeHomeBindingCatalog`. */
export type ClaudeHomeBindingCatalogSource = {
  hasHydratedProjectCatalog?: () => boolean
  getProjectGroups?: () => readonly ProjectGroup[]
  getRepos?: () => readonly Repo[]
  getFolderWorkspaces?: () => readonly FolderWorkspace[]
} | null

export type ClaudeHomeBindingCatalog = {
  groups: readonly ProjectGroup[]
  repos: readonly Repo[]
  folderWorkspaces: readonly FolderWorkspace[]
}

/**
 * A store that cannot answer refuses by name rather than reading as "no groups": an empty catalog
 * is indistinguishable from "nothing is bound", and answering that launches the shared home for a
 * group that bound another one. A store whose accessors exist but whose profile state has not
 * loaded yet returns `[]` from all three and reads exactly like "nothing is bound", so hydration
 * is asked about separately rather than inferred from the rows.
 */
export function readClaudeHomeBindingCatalog(
  store: ClaudeHomeBindingCatalogSource
): ClaudeHomeBindingCatalog {
  if (
    typeof store?.hasHydratedProjectCatalog !== 'function' ||
    typeof store.getProjectGroups !== 'function' ||
    typeof store.getRepos !== 'function' ||
    typeof store.getFolderWorkspaces !== 'function'
  ) {
    throw new Error('claude_home_binding_catalog_unavailable')
  }
  if (!store.hasHydratedProjectCatalog()) {
    throw new Error('claude_home_binding_catalog_unhydrated')
  }
  return {
    groups: store.getProjectGroups(),
    repos: store.getRepos(),
    folderWorkspaces: store.getFolderWorkspaces()
  }
}

export function resolveClaudeHomeBindingForSession(input: {
  store: ClaudeHomeBindingCatalogSource
  workspaceId: string
  executionHostId: ExecutionHostId | null
}): ResolvedClaudeHomeBinding | null {
  return resolveClaudeHomeBindingForWorkspace({
    ...readClaudeHomeBindingCatalog(input.store),
    workspaceId: input.workspaceId,
    executionHostId: input.executionHostId
  })
}

/**
 * The environment the Claude child is actually launched with: this process's own, with the agent
 * launch overlay on top (`claude-structured-launch-resolution.ts` merges them the same way). Every
 * check that has to agree with the config-dir pin reads this, never the overlay alone — an ambient
 * CLAUDE_CONFIG_DIR reaches the CLI whether or not the overlay mentions one.
 */
export function claudeChildLaunchEnv(overlay: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return { ...process.env, ...overlay }
}

/**
 * Whether a record's account home is a bound *custom* home — the only state that takes a launch off
 * the account router. A record bound to the home the CLI would find on its own is routed exactly as
 * an unbound session is.
 */
export function isEffectiveBoundClaudeHome(
  accountHome: ClaudeStructuredAccountHome,
  options: { env: NodeJS.ProcessEnv; platform?: NodeJS.Platform }
): boolean {
  return (
    accountHome.binding?.kind === 'project-group' &&
    isCustomClaudeConfigDir(accountHome.path, options)
  )
}

export type ClaudeStructuredAccountHome = {
  path: string
  binding?: { kind: 'project-group'; groupId: string }
}

/**
 * A group binding outranks every other source, and an unusable one refuses rather than falling
 * back: the user asked for that identity, and quietly substituting the shared home is the
 * silent-wrong-account failure the binding exists to prevent.
 */
export async function resolveClaudeStructuredAccountHome(input: {
  store: ClaudeHomeBindingCatalogSource
  /** Absent for a read with no workspace: there is no group to bind it. */
  location: {
    executionHostId: ExecutionHostId
    wslDistro: string | null
    workspaceId: string
  } | null
  launchEnv: NodeJS.ProcessEnv
  /** The account selector's answer for this runtime, when it has one. */
  getClaudeConfigDirectory: StructuredClaudeAccountHomeDeps['getClaudeConfigDirectory']
  assertBoundHomeUsable?: AssertClaudeBoundHomeUsable
}): Promise<ClaudeStructuredAccountHome> {
  const { location } = input
  const binding = location
    ? resolveClaudeHomeBindingForSession({
        store: input.store,
        workspaceId: location.workspaceId,
        executionHostId: location.executionHostId
      })
    : null
  const childEnv = claudeChildLaunchEnv(input.launchEnv)
  if (binding && !isCustomClaudeConfigDir(binding.configDir, { env: childEnv })) {
    // The binding names the home the CLI would find on its own, so the pin emits nothing and the
    // child reads exactly what an unbound session reads. Keep the directory, drop the marker: a
    // no-op binding must not take the launch off the account router.
    return { path: binding.configDir }
  }
  if (binding && location) {
    await (input.assertBoundHomeUsable ?? assertClaudeBoundHomeUsable)({
      binding,
      location: { executionHostId: location.executionHostId, wslDistro: location.wslDistro },
      launchEnv: childEnv
    })
    return {
      path: binding.configDir,
      binding: { kind: 'project-group', groupId: binding.groupId }
    }
  }
  return {
    path: resolveStructuredClaudeAccountHomePath({
      launchEnv: input.launchEnv,
      wslDistro: location?.wslDistro ?? null,
      getClaudeConfigDirectory: input.getClaudeConfigDirectory
    })
  }
}
