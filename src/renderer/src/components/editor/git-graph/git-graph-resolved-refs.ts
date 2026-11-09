import { useAppStore } from '@/store'
import type {
  GitHistoryRefs,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'

// Persists the refs the server actually resolved when they differ from the requested filter.
export function adoptResolvedGitGraphRefs(
  worktreeId: string,
  filter: GitHistoryRefs,
  result: GitHistoryResult | undefined
): void {
  const refs = result?.resolvedRefs
  if (!Array.isArray(filter) || !refs || JSON.stringify(filter) === JSON.stringify(refs)) {
    return
  }
  useAppStore.setState((state) => ({
    gitGraphFiltersByWorktree: {
      ...state.gitGraphFiltersByWorktree,
      [worktreeId]: refs.length ? refs : 'head'
    }
  }))
}
