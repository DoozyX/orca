import { useMemo, useState } from 'react'
import type { gitGraphScope } from '@/lib/source-control/graph/git-graph-tab'
import {
  gitHistoryWipId,
  isGitHistoryWipId
} from '../../../../../shared/git/history/git-history-wip-rows'
import type {
  GitHistoryItem,
  GitHistoryRefs,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'
import { GitGraphModel } from './git-graph-model'
import { buildGitGraphWipItems } from './git-graph-wip-items'
import { useGitGraphWipStatus } from './use-git-graph-wip-status'

const sameWipItems = (a: readonly GitHistoryItem[], b: readonly GitHistoryItem[]): boolean =>
  a.length === b.length &&
  a.every((item, i) => item.id === b[i]!.id && item.parentIds[0] === b[i]!.parentIds[0])

// WIP rows go before the first page, so their lanes come from the same swimlane pass.
export function useGitGraphRows(
  scope: ReturnType<typeof gitGraphScope>,
  result: GitHistoryResult | undefined,
  filter: GitHistoryRefs,
  laneWidth: number,
  selectedId: string | undefined,
  revealId: string | undefined
) {
  const wip = useGitGraphWipStatus(scope)
  const builtWipItems = useMemo(
    () =>
      buildGitGraphWipItems({
        workspaces: wip.workspaces,
        filter,
        currentRefId: result?.currentRef?.id,
        loadedIds: new Set(result?.items.map((item) => item.id))
      }),
    [wip.workspaces, filter, result]
  )
  // Unchanged WIP rows keep their identity so paging appends instead of rebuilding the graph.
  const [stableWipItems, setStableWipItems] = useState(builtWipItems)
  const wipUnchanged = sameWipItems(builtWipItems, stableWipItems)
  if (!wipUnchanged) {
    setStableWipItems(builtWipItems)
  }
  const wipItems = wipUnchanged ? stableWipItems : builtWipItems
  const wipById = useMemo(
    () =>
      new Map(
        wip.workspaces.map((workspace) => [gitHistoryWipId(workspace.worktreeId), workspace])
      ),
    [wip.workspaces]
  )
  const graphResult = useMemo(
    () =>
      result && wipItems.length > 0 ? { ...result, items: [...wipItems, ...result.items] } : result,
    [result, wipItems]
  )
  const [model] = useState(() => new GitGraphModel(laneWidth))
  const graph = model.update(graphResult, selectedId, revealId)
  // A WIP selection outlives its row (clean, hidden or failed status), so show the newest commit instead.
  const selected =
    graph.selected ??
    (selectedId !== undefined && isGitHistoryWipId(selectedId)
      ? graph.rows.find((row) => !isGitHistoryWipId(row.historyItem.id))?.historyItem
      : undefined)
  return { ...graph, selected, wipById, refreshWip: wip.refresh }
}
