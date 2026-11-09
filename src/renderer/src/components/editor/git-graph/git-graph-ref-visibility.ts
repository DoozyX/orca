import {
  GIT_HISTORY_MAX_REFS,
  type GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'

export type GitGraphRefVisibilityError = 'last-visible' | 'too-many-refs' | 'refs-incomplete'

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
  /** Every ref that exists; undefined when the list is partial, so All can be neither expanded nor restored. */
  allRefIds?: string[]
  currentRefId?: string
  refIds: string[]
  visible: boolean
}): { filter: GitHistoryRefs } | { refusal: GitGraphRefVisibilityError } {
  const { filter, allRefIds, currentRefId, refIds, visible } = input
  if (filter === 'all' && !allRefIds) {
    return visible ? { filter: 'all' } : { refusal: 'refs-incomplete' }
  }
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
  if (!shown.size) {
    return { refusal: 'last-visible' }
  }
  if (allRefIds && allRefIds.length === shown.size && allRefIds.every((id) => shown.has(id))) {
    return { filter: 'all' }
  }
  if (shown.size > GIT_HISTORY_MAX_REFS) {
    return { refusal: 'too-many-refs' }
  }
  return { filter: [...shown].sort() }
}
