import { useMemo } from 'react'
import type { gitGraphScope } from '@/lib/git-graph-tab'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels
} from '../../../../../shared/git/history/git-history-graph'
import { gitHistoryWipId } from '../../../../../shared/git/history/git-history-wip-rows'
import type {
  GitHistoryRefs,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'
import { buildGitGraphWipItems } from './git-graph-wip-items'
import { useGitGraphWipStatus } from './use-git-graph-wip-status'

// WIP rows go before the first page, so their lanes come from the same swimlane pass.
export function useGitGraphRows(
  scope: ReturnType<typeof gitGraphScope>,
  result: GitHistoryResult | undefined,
  filter: GitHistoryRefs
) {
  const wip = useGitGraphWipStatus(scope)
  const wipItems = useMemo(
    () =>
      buildGitGraphWipItems({
        workspaces: wip.workspaces,
        filter,
        currentRefId: result?.currentRef?.id,
        loadedIds: new Set(result?.items.map((item) => item.id))
      }),
    [wip.workspaces, filter, result]
  )
  const wipById = useMemo(
    () =>
      new Map(
        wip.workspaces.map((workspace) => [gitHistoryWipId(workspace.worktreeId), workspace])
      ),
    [wip.workspaces]
  )
  const rows = useMemo(
    () =>
      result
        ? buildGitHistoryViewModels(
            [...wipItems, ...result.items],
            buildDefaultGitHistoryColorMap(result),
            result.currentRef
          )
        : [],
    [result, wipItems]
  )
  return { rows, wipById, refreshWip: wip.refresh }
}
