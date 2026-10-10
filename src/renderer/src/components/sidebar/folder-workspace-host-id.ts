import {
  normalizeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import { getFolderWorkspaceExecutionHostIdForRows } from './worktree-list/listing/host-filtering'

/** Host headers, filtering and reveal must agree on the folder's execution owner. */
export function getFolderWorkspaceHostId(
  folderWorkspace: Pick<FolderWorkspace, 'connectionId' | 'executionHostId'>,
  projectGroup: Pick<ProjectGroup, 'connectionId' | 'executionHostId'>,
  defaultHostId: ExecutionHostId
): ExecutionHostId {
  return getFolderWorkspaceExecutionHostIdForRows({ folderWorkspace, projectGroup, defaultHostId })
}

/**
 * Which host *owns* a folder workspace's `projectGroupId`, or undefined when the
 * row carries no host stamp at all. Group ids are unique per host, so every
 * lookup of that id must be scoped by this. Deliberately distinct from
 * getFolderWorkspaceHostId above, which answers where the row renders.
 */
export function getFolderWorkspaceProjectGroupHostId(
  folderWorkspace: Pick<FolderWorkspace, 'connectionId' | 'executionHostId'>
): ExecutionHostId | undefined {
  return (
    normalizeExecutionHostId(folderWorkspace.executionHostId) ??
    (folderWorkspace.connectionId ? toSshExecutionHostId(folderWorkspace.connectionId) : undefined)
  )
}
