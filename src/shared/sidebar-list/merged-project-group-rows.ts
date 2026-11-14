import type { ExecutionHostId } from '../execution-host'
import type { ProjectGroup } from '../project-group-types'
import type { Repo } from '../repo-types'
import {
  buildMergedProjectGroupIndex,
  getRepoProjectGroupHostId,
  resolveMergedProjectGroupId
} from './cross-host-project-group-merge'
import { getFolderWorkspaceProjectGroupHostId } from './hosts/folder-workspace-host-id'
import type { RenderableFolderWorkspace } from './folders/folder-workspace-lanes'
import { getProjectGroupOccurrencePaths } from './sections/project-group-sections'

/** Maps repos and folders onto the merged group row whose header and reveal path they share. */
export function getMergedProjectGroupRows(
  projectGroups: readonly ProjectGroup[],
  defaultHostId: ExecutionHostId
) {
  const index = buildMergedProjectGroupIndex(projectGroups)
  const occurrencePaths = getProjectGroupOccurrencePaths(projectGroups)
  return {
    occurrencePaths,
    occurrencePathOfRepo: (repo: Repo | undefined) =>
      repo?.projectGroupId
        ? occurrencePaths.get(
            resolveMergedProjectGroupId(
              index,
              repo.projectGroupId,
              getRepoProjectGroupHostId(repo, defaultHostId)
            )
          )
        : undefined,
    rowIdOfFolder: (pair: RenderableFolderWorkspace) =>
      resolveMergedProjectGroupId(
        index,
        pair.folderWorkspace.projectGroupId,
        getFolderWorkspaceProjectGroupHostId(pair.folderWorkspace)
      )
  }
}
