import { useCallback, useEffect, useState } from 'react'
import { GIT_GRAPH_REFRESH_EVENT } from '@/lib/source-control/graph/git-graph-refresh-event'

/** Bumps when this worktree's graph refresh event fires or the caller asks, so the ref rail reloads. */
export function useGitGraphRefsEpoch(worktreeId: string): [number, () => void] {
  const [refsEpoch, setRefsEpoch] = useState(0)
  const bump = useCallback(() => setRefsEpoch((epoch) => epoch + 1), [])
  useEffect(() => {
    const onRefresh = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === worktreeId) {
        bump()
      }
    }
    window.addEventListener(GIT_GRAPH_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(GIT_GRAPH_REFRESH_EVENT, onRefresh)
  }, [worktreeId, bump])
  return [refsEpoch, bump]
}
