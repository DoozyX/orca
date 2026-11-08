import {
  gitHistoryWipId,
  isGitHistoryWipId
} from '../../../../../shared/git/history/git-history-wip-rows'
import type {
  GitHistoryItem,
  GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'
import type { GitStatusEntry } from '../../../../../shared/git/status/git-status-types'
import { summarizeFileChanges } from './git-graph-file-summary'
import { isGitGraphRefVisible } from './git-graph-ref-visibility'

export type GitGraphWipWorkspace = {
  worktreeId: string
  worktreePath: string
  displayName: string
  /** refs/heads/<branch>; absent when HEAD is detached. */
  branchRefId?: string
  headOid: string
  entries: GitStatusEntry[]
  didHitLimit: boolean
  current: boolean
}

export function buildGitGraphWipItems(input: {
  workspaces: readonly GitGraphWipWorkspace[]
  filter: GitHistoryRefs
  currentRefId?: string
  loadedIds: ReadonlySet<string>
}): GitHistoryItem[] {
  const { workspaces, filter, currentRefId, loadedIds } = input
  return workspaces
    .filter((workspace) =>
      workspace.branchRefId
        ? isGitGraphRefVisible(filter, workspace.branchRefId, currentRefId)
        : loadedIds.has(workspace.headOid)
    )
    .toSorted(
      (a, b) => Number(b.current) - Number(a.current) || a.displayName.localeCompare(b.displayName)
    )
    .map((workspace) => ({
      id: gitHistoryWipId(workspace.worktreeId),
      parentIds: [workspace.headOid],
      subject: '// WIP',
      message: '// WIP'
    }))
}

export function gitGraphWipBranchLabel(workspace: GitGraphWipWorkspace): string {
  return workspace.branchRefId
    ? workspace.branchRefId.replace(/^refs\/heads\//, '')
    : workspace.headOid.slice(0, 7)
}

export function summarizeGitGraphWipCounts(entries: readonly GitStatusEntry[]): {
  changed: number
  added: number
  deleted: number
} {
  const counts = summarizeFileChanges(entries)
  return {
    changed: (counts.modified ?? 0) + (counts.renamed ?? 0),
    added: (counts.added ?? 0) + (counts.untracked ?? 0),
    deleted: counts.deleted ?? 0
  }
}

// WIP rows are synthesized by the tab, so a history page never contains the selected one.
export function resolveGitGraphSelection(
  items: readonly GitHistoryItem[] | undefined,
  selection: string | undefined
): string | undefined {
  if (selection !== undefined && isGitHistoryWipId(selection)) {
    return selection
  }
  return items?.find((item) => item.id === selection)?.id ?? items?.[0]?.id
}
