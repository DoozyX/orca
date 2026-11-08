import { GIT_HISTORY_MAX_REFS } from '../../../../../shared/git/history/git-history-types'
import type { Translate } from '@/i18n/use-translate'
import type { GitGraphRefVisibilityError } from './git-graph-ref-visibility'

export const gitGraphOldServerMessage = (t: Translate): string =>
  t('gitGraph.oldServer', "This server's Orca version shows only the current branch")

/** `capped`: some group has more refs than one page lists, which is why the list is incomplete. */
export function gitGraphRefVisibilityMessage(
  t: Translate,
  error: GitGraphRefVisibilityError,
  { visible, capped }: { visible: boolean; capped: boolean }
): string {
  if (error === 'last-visible') {
    return t('gitGraph.lastVisibleRef', 'At least one branch or tag must stay visible')
  }
  if (error === 'refs-incomplete' && !capped) {
    return t(
      'gitGraph.refsIncomplete',
      'Not every branch and tag is loaded yet. Wait for the list, or Refresh, to hide one.'
    )
  }
  return visible
    ? t(
        'gitGraph.tooManyRefsShow',
        'The graph can show at most {{max}} chosen branches and tags. Hide some first.',
        { max: GIT_HISTORY_MAX_REFS.toLocaleString() }
      )
    : t(
        'gitGraph.tooManyRefs',
        'The graph can show at most {{max}} chosen branches and tags. Pick fewer to hide.',
        { max: GIT_HISTORY_MAX_REFS.toLocaleString() }
      )
}
