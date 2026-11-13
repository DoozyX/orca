import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  type ExecutionHostId
} from './execution-host'
import type { ClaudeManagedAccount } from './managed-account-types'
import type { FolderWorkspace } from './folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from './project-group-types'
import type { Repo } from './repo-types'
import { getExecutionHostIdFromWorktreeHostIdentity } from './worktree/host-qualified-identity'
import { getRepoIdFromWorktreeId } from './worktree/id'
import { normalizeWorkspaceSessionKeyToWorkspaceId, parseWorkspaceKey } from './workspace-scope'

export type ClaudeAccountAssignmentSource =
  | { kind: 'project'; repoId: string; name: string }
  | { kind: 'group'; groupId: string; name: string }

/** The Orca Claude account a project or one of its groups pins, and which of them pinned it. */
export type ClaudeAccountAssignment = {
  accountId: string
  source: ClaudeAccountAssignmentSource
}

/** A local project's routing key, with the assignment that applies to it (null follows global). */
export type ClaudeAccountScope = {
  projectId: string
  assignment: ClaudeAccountAssignment | null
}

/** WSL accounts are routed per distro and never answer a host launch. */
export function hostClaudeAccountIds(
  accounts: readonly Pick<ClaudeManagedAccount, 'id' | 'managedAuthRuntime'>[]
): Set<string> {
  return new Set(
    accounts.filter((account) => account.managedAuthRuntime !== 'wsl').map((account) => account.id)
  )
}

type HostStampedRow = { connectionId?: string | null; executionHostId?: string | null }

/** Catalogs hold rows from every host under one id; an Orca account exists only on this one. */
function findLocalRow<T extends HostStampedRow>(
  rows: readonly T[],
  matchesId: (row: T) => boolean
): T | undefined {
  return rows.find(
    (row) => matchesId(row) && getRepoExecutionHostId(row) === LOCAL_EXECUTION_HOST_ID
  )
}

/** Nearest assignment walking up `parentGroupId`; ids of removed accounts are skipped. */
export function resolveClaudeAccountAssignmentForGroup(
  groups: readonly ProjectGroup[],
  groupId: string | null | undefined,
  knownAccountIds: ReadonlySet<string>
): ClaudeAccountAssignment | null {
  const visited = new Set<string>()
  let currentId = groupId
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const id = currentId
    const group = findLocalRow(groups, (candidate) => candidate.id === id)
    if (!group) {
      return null
    }
    if (group.claudeAccountId && knownAccountIds.has(group.claudeAccountId)) {
      return {
        accountId: group.claudeAccountId,
        source: { kind: 'group', groupId: group.id, name: group.name }
      }
    }
    currentId = group.parentGroupId
  }
  return null
}

export type ClaudeAccountAssignmentCatalog = {
  repos: readonly Repo[]
  folderWorkspaces: readonly FolderWorkspace[]
  groups: readonly ProjectGroup[]
  /** Host-runtime accounts only. */
  knownAccountIds: ReadonlySet<string>
}

export type ClaudeAccountAssignmentLookup = ClaudeAccountAssignmentCatalog & {
  workspaceId: string
  /** Disambiguates a workspace id that exists on more than one host; else read off the id itself. */
  executionHostId?: ExecutionHostId | null
}

/** Null when the workspace is not a project on this host. */
export function resolveClaudeAccountScopeForWorkspace(
  input: ClaudeAccountAssignmentLookup
): ClaudeAccountScope | null {
  const hostId =
    input.executionHostId ?? getExecutionHostIdFromWorktreeHostIdentity(input.workspaceId)
  if (hostId && hostId !== LOCAL_EXECUTION_HOST_ID) {
    return null
  }
  // A workspace id arrives as a WorkspaceKey, a host-qualified identity or a bare id.
  const workspaceId = normalizeWorkspaceSessionKeyToWorkspaceId(input.workspaceId)
  const scope = parseWorkspaceKey(workspaceId)
  const folderWorkspaceId = scope?.type === 'folder' ? scope.folderWorkspaceId : workspaceId
  const folderWorkspace = findLocalRow(
    input.folderWorkspaces,
    (workspace) => workspace.id === folderWorkspaceId
  )
  if (folderWorkspace) {
    return {
      projectId: folderWorkspace.id,
      assignment: resolveClaudeAccountAssignmentForGroup(
        input.groups,
        folderWorkspace.projectGroupId,
        input.knownAccountIds
      )
    }
  }
  const repoId = getRepoIdFromWorktreeId(
    scope?.type === 'worktree' ? scope.worktreeId : workspaceId
  )
  const repo = findLocalRow(input.repos, (candidate) => candidate.id === repoId)
  if (!repo) {
    return null
  }
  if (repo.claudeAccountId && input.knownAccountIds.has(repo.claudeAccountId)) {
    return {
      projectId: repo.id,
      assignment: {
        accountId: repo.claudeAccountId,
        source: { kind: 'project', repoId: repo.id, name: repo.displayName }
      }
    }
  }
  return {
    projectId: repo.id,
    assignment: resolveClaudeAccountAssignmentForGroup(
      input.groups,
      repo.projectGroupId,
      input.knownAccountIds
    )
  }
}

export function resolveClaudeAccountAssignmentForWorkspace(
  input: ClaudeAccountAssignmentLookup
): ClaudeAccountAssignment | null {
  return resolveClaudeAccountScopeForWorkspace(input)?.assignment ?? null
}
