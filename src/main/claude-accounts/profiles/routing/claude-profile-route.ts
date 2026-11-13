import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ClaudeAccountAssignment,
  ClaudeAccountScope
} from '../../../../shared/claude-account-assignment'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_USER_CONFIG_DIR_ENV
} from '../../../../shared/claude-profile-routing'
import type { ClaudeEnvPatch } from '../../runtime-auth/environment'
import type { ClaudeRuntimeAuthPreparation } from '../../runtime-auth/runtime-auth-types'
import { readUserClaudeConfigDirAsSet, type ClaudeProfileDescriptor } from '../claude-profile-paths'
import type { ClaudeLaunchScope } from './claude-launch-scope'

/** Which account one launch names, and the pointer file its pane re-reads. */
export type ClaudeRoute = {
  /** Before the System default cover rule. */
  selected: ClaudeProfileDescriptor | null
  assignment: ClaudeAccountAssignment | null
  pointerPath: string
}

export type ClaudeRouteSources = {
  /** The project a workspace belongs to and its assigned account; throws while the catalog is unloaded. */
  assignment: ((workspaceId: string) => ClaudeAccountScope | null) | undefined
  describe: (accountId: string) => ClaudeProfileDescriptor
  globalProfile: () => ClaudeProfileDescriptor | null
  globalPointerPath: string
  scopePointerDir: string
}

// A project id becomes a file name, so anything that could leave the folder keeps the global pointer.
const SCOPE_POINTER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** A workspace in a local project routes by its assignment and gets that project's pointer. */
export function resolveClaudeRoute(
  sources: ClaudeRouteSources,
  scope: ClaudeLaunchScope | undefined
): ClaudeRoute {
  const project =
    scope?.workspaceId && sources.assignment ? sources.assignment(scope.workspaceId) : null
  if (!project) {
    return {
      selected: sources.globalProfile(),
      assignment: null,
      pointerPath: sources.globalPointerPath
    }
  }
  return {
    selected: project.assignment
      ? sources.describe(project.assignment.accountId)
      : sources.globalProfile(),
    assignment: project.assignment,
    pointerPath: SCOPE_POINTER_NAME.test(project.projectId)
      ? join(sources.scopePointerDir, project.projectId)
      : sources.globalPointerPath
  }
}

/** Every per-project pointer an open pane may hold, re-resolved; unloaded catalogs keep theirs. */
async function claudeScopePointerRoutes(sources: ClaudeRouteSources): Promise<ClaudeRoute[]> {
  // No folder yet means no pane has been given a per-project pointer.
  const projectIds = await readdir(sources.scopePointerDir).catch(() => [])
  const routes: ClaudeRoute[] = []
  for (const projectId of projectIds) {
    try {
      // A project that left the catalog follows the global selection, like any unassigned pane.
      routes.push({
        ...resolveClaudeRoute(sources, { workspaceId: projectId }),
        pointerPath: join(sources.scopePointerDir, projectId)
      })
    } catch {
      // The catalog is not loaded yet; the pointer keeps the last published account.
    }
  }
  return routes
}

export function claudeRouteLaunchEnv(route: ClaudeRoute, home: string | null): ClaudeEnvPatch {
  return {
    [CLAUDE_PROFILE_POINTER_ENV]: route.pointerPath,
    // Preserve the user's inherited CLAUDE_CONFIG_DIR for System default.
    ...(home ? { CLAUDE_CONFIG_DIR: home, [CLAUDE_INJECTED_CONFIG_DIR_ENV]: home } : {})
  }
}

export function claudeRoutePreparation(
  route: ClaudeRoute,
  routed: { accountId: string; home: string } | null,
  systemDefaultHome: () => string
): ClaudeRuntimeAuthPreparation {
  return {
    configDir: routed?.home ?? systemDefaultHome(),
    runtime: 'host',
    wslDistro: null,
    wslLinuxConfigDir: null,
    envPatch: claudeRouteLaunchEnv(route, routed?.home ?? null),
    provenance: routed ? `profile:${routed.accountId}` : 'system'
  }
}

/** A pane's env before routing: the global pointer, and the user's own value for System default to restore. */
export function claudeTerminalBaseEnv(pointerPath: string, env: NodeJS.ProcessEnv): ClaudeEnvPatch {
  const userConfigDir = readUserClaudeConfigDirAsSet(env)
  return {
    [CLAUDE_PROFILE_POINTER_ENV]: pointerPath,
    ...(userConfigDir ? { [CLAUDE_USER_CONFIG_DIR_ENV]: userConfigDir } : {})
  }
}

/** Never rejects: a pointer that cannot be rewritten keeps its last account and is logged. */
export async function publishClaudeScopePointers(
  sources: ClaudeRouteSources,
  write: (route: ClaudeRoute) => void
): Promise<void> {
  try {
    for (const route of await claudeScopePointerRoutes(sources)) {
      write(route)
    }
  } catch (error) {
    console.warn('[claude-profile] Could not update the per-project Claude pointers:', error)
  }
}
