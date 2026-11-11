import { useEffect } from 'react'
import type { GitGraphHistoryController } from './git-graph-history-controller'
import type { GitHistoryResult } from '../../../../../shared/git/history/git-history-types'

// Keyed by result so it outlives tab remounts without keeping replaced history alive.
const pagedInView = new WeakSet<GitHistoryResult>()

/** Asks for the next page once per result; a failed or no-progress page keeps its result, so only Load more or Refresh retries it. */
export function loadMoreInView(
  controller: GitGraphHistoryController,
  rendered: GitHistoryResult | undefined
): void {
  const { result, loading } = controller.view.getState()
  // Only page the result whose rows were measured in view; a newer one gets its own check.
  if (result && result === rendered && result.hasMore && !loading && !pagedInView.has(result)) {
    pagedInView.add(result)
    void controller.loadMore()
  }
}

// About 200px of rows, so scrolling fetches before the end shows.
const PAGE_AHEAD_ROWS = 8

/** Viewport demand, not scroll events: pages whenever the end of loaded rows is in view. */
export function usePageWhileEndInView(
  controller: GitGraphHistoryController,
  result: GitHistoryResult | undefined,
  loading: boolean,
  rowCount: number,
  lastVisibleIndex: number
): void {
  const endInView = lastVisibleIndex >= 0 && lastVisibleIndex >= rowCount - 1 - PAGE_AHEAD_ROWS
  useEffect(() => {
    if (endInView) {
      loadMoreInView(controller, result)
    }
  }, [endInView, result, loading, controller])
}
