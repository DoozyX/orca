import {
  GIT_HISTORY_MAX_REFS,
  type GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'

export type GitGraphRefVisibilityError = 'last-visible' | 'too-many-refs'

export function isGitGraphRefVisible(
  filter: GitHistoryRefs,
  refId: string,
  currentRefId?: string
): boolean {
  if (filter === 'all') {
    return true
  }
  return filter === 'head' ? refId === currentRefId : filter.includes(refId)
}

export function toggleGitGraphRefVisibility(input: {
  filter: GitHistoryRefs
  allRefIds: string[]
  currentRefId?: string
  refIds: string[]
  visible: boolean
}): { filter: GitHistoryRefs } | { error: GitGraphRefVisibilityError } {
  const { filter, allRefIds, currentRefId, refIds, visible } = input
  const shown = new Set(
    filter === 'all' ? allRefIds : filter === 'head' ? (currentRefId ? [currentRefId] : []) : filter
  )
  for (const id of refIds) {
    if (visible) {
      shown.add(id)
    } else {
      shown.delete(id)
    }
  }
  if (allRefIds.length === shown.size && allRefIds.every((id) => shown.has(id))) {
    return { filter: 'all' }
  }
  if (!shown.size) {
    return { error: 'last-visible' }
  }
  if (shown.size > GIT_HISTORY_MAX_REFS) {
    return { error: 'too-many-refs' }
  }
  return { filter: [...shown].sort() }
}
