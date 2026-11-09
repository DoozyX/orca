import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { normalizeSourceControlViewMode } from '@/components/right-sidebar/source-control/commit/commit-drafts'
import { compareFileNames } from '../../../../../shared/file-listing/file-name-sort'
import {
  buildSourceControlTree,
  compactSourceControlTree,
  flattenSourceControlTree,
  type SourceControlTreeDirectoryNode,
  type SourceControlTreeNode
} from '../../../../../shared/source-control/listing/source-control-tree'
import type { GitFileStatus } from '../../../../../shared/git/status/git-status-types'
import { CommitFileRow } from '@/components/right-sidebar/source-control/sync/git-history-commit-files'
import { SourceControlBranchTreeDirectoryRow } from '@/components/right-sidebar/source-control/listing/tree-directory-rows'
import type { SourceControlRowOpenEvent } from '@/components/right-sidebar/source-control/listing/split-open'
import type { SourceControlViewMode } from '../../../../../shared/ui-chrome-types'

export type GitGraphFileListEntry = {
  path: string
  status: GitFileStatus
  added?: number
  removed?: number
}

export type GitGraphFileSort = 'asc' | 'desc'

const TREE_AREA = 'commit'

// Shares the Source Control panel's Path/Tree preference so both views always agree.
export function useGitGraphFileViewMode(): [
  SourceControlViewMode,
  (mode: SourceControlViewMode) => void
] {
  const viewMode = normalizeSourceControlViewMode(
    useAppStore((state) => state.settings?.sourceControlViewMode)
  )
  return [
    viewMode,
    (mode) => void useAppStore.getState().updateSettings({ sourceControlViewMode: mode })
  ]
}

function sortEntries<E extends GitGraphFileListEntry>(entries: E[], sort: GitGraphFileSort): E[] {
  const direction = sort === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => direction * compareFileNames(a.path, b.path))
}

// The shared tree sorts folders ascending; mirror them so Z→A reads top-down.
function reverseDirectories<E extends GitGraphFileListEntry>(
  nodes: SourceControlTreeNode<E, typeof TREE_AREA>[]
): SourceControlTreeNode<E, typeof TREE_AREA>[] {
  const directories = nodes
    .filter((node): node is SourceControlTreeDirectoryNode<E, typeof TREE_AREA> => {
      return node.type === 'directory'
    })
    .toReversed()
    .map((node) => ({ ...node, children: reverseDirectories(node.children) }))
  return [...directories, ...nodes.filter((node) => node.type === 'file')]
}

function buildTreeRoots<E extends GitGraphFileListEntry>(
  entries: E[],
  sort: GitGraphFileSort
): SourceControlTreeNode<E, typeof TREE_AREA>[] {
  const direction = sort === 'asc' ? 1 : -1
  const roots = buildSourceControlTree(
    TREE_AREA,
    entries,
    (a, b) => direction * compareFileNames(a.path, b.path)
  )
  return compactSourceControlTree(sort === 'asc' ? roots : reverseDirectories(roots))
}

function collectDirectoryKeys<E extends GitGraphFileListEntry>(
  nodes: readonly SourceControlTreeNode<E, typeof TREE_AREA>[]
): string[] {
  return nodes.flatMap((node) =>
    node.type === 'directory' ? [node.key, ...collectDirectoryKeys(node.children)] : []
  )
}

export function GitGraphFileList<E extends GitGraphFileListEntry>({
  entries,
  sort,
  viewMode,
  collapseAllRequest = 0,
  onOpenFile
}: {
  entries: E[]
  sort: GitGraphFileSort
  viewMode: SourceControlViewMode
  // Bumping this folds every folder; the toolbar that owns Collapse All can span several lists.
  collapseAllRequest?: number
  onOpenFile: (entry: E, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [appliedRequest, setAppliedRequest] = useState(collapseAllRequest)
  const roots = useMemo(
    () => (viewMode === 'tree' ? buildTreeRoots(entries, sort) : []),
    [entries, sort, viewMode]
  )
  if (appliedRequest !== collapseAllRequest) {
    setAppliedRequest(collapseAllRequest)
    setCollapsed(new Set(collectDirectoryKeys(roots)))
  }

  if (viewMode === 'list') {
    return (
      <>
        {sortEntries(entries, sort).map((entry) => (
          <CommitFileRow key={entry.path} entry={entry} onOpen={onOpenFile} />
        ))}
      </>
    )
  }

  const toggle = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  }
  return (
    <>
      {flattenSourceControlTree(roots, collapsed).map((node) =>
        node.type === 'directory' ? (
          <SourceControlBranchTreeDirectoryRow
            key={node.key}
            node={node}
            isCollapsed={collapsed.has(node.key)}
            onToggle={() => toggle(node.key)}
          />
        ) : (
          <CommitFileRow key={node.key} entry={node.entry} depth={node.depth} onOpen={onOpenFile} />
        )
      )}
    </>
  )
}
