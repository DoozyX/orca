import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import { getProjectGroupHeaderKey } from '../../../../../../shared/sidebar-list/group-keys'
import {
  buildMergedProjectGroupIndex,
  findMergedProjectGroup,
  findMergedProjectGroupByRowId,
  getMergedProjectGroupAncestry,
  type MergedProjectGroup,
  type MergedProjectGroupIndex
} from '../../../../../../shared/sidebar-list/cross-host-project-group-merge'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { ProjectGroupingModel } from '../../../../../../shared/project-section-grouping'

function getProjectIdFromHeaderRowKey(rowKey: string): string | null {
  if (!rowKey.startsWith('project:')) {
    return null
  }
  const withoutPrefix = rowKey.slice('project:'.length)
  const setupSeparator = withoutPrefix.indexOf('::setup:')
  return setupSeparator === -1 ? withoutPrefix : withoutPrefix.slice(0, setupSeparator)
}

function getRepoIdsFromHeaderRowKey(
  rowKey: string,
  repoMap: Map<string, Repo>,
  projectGrouping?: ProjectGroupingModel
): string[] {
  if (rowKey.startsWith('repo:')) {
    return [rowKey.slice('repo:'.length)]
  }
  const setupMarker = '::setup:'
  const setupIndex = rowKey.indexOf(setupMarker)
  if (rowKey.startsWith('project:') && setupIndex !== -1) {
    return [rowKey.slice(setupIndex + setupMarker.length)]
  }
  const projectId = getProjectIdFromHeaderRowKey(rowKey)
  if (!projectId) {
    return []
  }
  const repoIds = new Set<string>()
  for (const setup of projectGrouping?.projectHostSetups ?? []) {
    if (setup.projectId === projectId && repoMap.has(setup.repoId)) {
      repoIds.add(setup.repoId)
    }
  }
  const project = projectGrouping?.projects.find((candidate) => candidate.id === projectId)
  for (const repoId of project?.sourceRepoIds ?? []) {
    if (repoMap.has(repoId)) {
      repoIds.add(repoId)
    }
  }
  return [...repoIds]
}

// Why the drawn ancestry: reveal must open the merged headers the row renders under,
// including a shared-id group's last-copy parents (#22022, #30045).
function getProjectGroupAncestorKeys(
  row: MergedProjectGroup | undefined,
  mergedIndex: MergedProjectGroupIndex
): string[] {
  return row
    ? getMergedProjectGroupAncestry(mergedIndex, row).map((entry) =>
        getProjectGroupHeaderKey(entry.rowId)
      )
    : []
}

export function getSidebarRowRevealAncestorKeys(args: {
  rowKey: string
  repoMap: Map<string, Repo>
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
}): string[] {
  const mergedIndex = buildMergedProjectGroupIndex(args.projectGroups)
  if (args.rowKey.startsWith('project-group:')) {
    // Why the merged row: a rendered row key carries no host, so only the row it
    // was built from can say which host's parent chain to walk.
    const row = findMergedProjectGroupByRowId(
      mergedIndex,
      args.rowKey.slice('project-group:'.length)
    )
    return getProjectGroupAncestorKeys(row, mergedIndex).slice(0, -1)
  }
  const keys = new Set<string>()
  for (const repoId of getRepoIdsFromHeaderRowKey(
    args.rowKey,
    args.repoMap,
    args.projectGrouping
  )) {
    const repo = args.repoMap.get(repoId)
    const repoHostId =
      repo?.connectionId || repo?.executionHostId ? getRepoExecutionHostId(repo) : undefined
    const row = repo?.projectGroupId
      ? findMergedProjectGroup(mergedIndex, repo.projectGroupId, repoHostId)
      : undefined
    for (const key of getProjectGroupAncestorKeys(row, mergedIndex)) {
      keys.add(key)
    }
  }
  return [...keys]
}
