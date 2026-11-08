import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { gitGraphScope } from '@/lib/git-graph-tab'
import {
  gitGraphHistoryForTab,
  type GitGraphHistoryController
} from './git-graph-history-controller'
import type { HistoryView } from './git-graph-history-view'
import { gitGraphRefVisibilityMessage } from './git-graph-ref-messages'
import { isGitGraphRefVisible, toggleGitGraphRefVisibility } from './git-graph-ref-visibility'
import { setGitGraphFilter } from './use-git-graph-history'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'

// A paging view still counts: `reveal` supersedes the running jump and waits for its page itself.
const isSettled = (view: HistoryView) =>
  view.disposed === true || view.error !== undefined || view.result !== undefined

const loadedView = (controller: GitGraphHistoryController): Promise<HistoryView> =>
  new Promise((resolve) => {
    const now = controller.view.getState()
    if (isSettled(now)) {
      resolve(now)
      return
    }
    const stop = controller.view.subscribe((view) => {
      if (isSettled(view)) {
        stop()
        resolve(view)
      }
    })
  })

const MAX_REVEAL_ATTEMPTS = 3

/** Selects the commit once history is loaded; true when it was selected. */
export async function revealCommitWhenLoaded(
  controller: GitGraphHistoryController,
  id: string
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_REVEAL_ATTEMPTS; attempt++) {
    const view = await loadedView(controller)
    if (view.disposed) {
      return false
    }
    if (view.error !== undefined) {
      toast.message(view.error)
      return false
    }
    const index = await controller.reveal(id)
    if (index >= 0) {
      return true
    }
    // -2: a reload that started mid-reveal (filter change) replaced the history; wait and try again.
    if (index === -2) {
      continue
    }
    const after = controller.view.getState()
    if (
      after.result &&
      !after.result.hasMore &&
      !after.result.items.some((item) => item.id === id)
    ) {
      toast.message(translate('gitGraph.commitNotFound', 'That commit is not in the loaded graph'))
    }
    return false
  }
  return false
}

/** Makes `ref` visible in the Git Graph filter, then selects its commit once history is loaded. */
export async function revealGitRefInGitGraph(
  worktreeId: string,
  scope: NonNullable<ReturnType<typeof gitGraphScope>>,
  ref: GitHistoryItemRef
): Promise<boolean> {
  if (!ref.revision) {
    return false
  }
  const controller = gitGraphHistoryForTab(worktreeId)
  const filter = useAppStore.getState().gitGraphFiltersByWorktree?.[worktreeId] ?? 'all'
  const currentRefId = controller.view.getState().result?.currentRef?.id ?? scope.worktree.branch
  if (!isGitGraphRefVisible(filter, ref.id, currentRefId)) {
    // Showing only adds to the chosen list, so the full ref list is not needed and All is never restored.
    const outcome = toggleGitGraphRefVisibility({
      filter,
      currentRefId,
      refIds: [ref.id],
      visible: true
    })
    if ('error' in outcome) {
      toast.message(
        gitGraphRefVisibilityMessage(translate, outcome.error, { visible: true, capped: false })
      )
      return false
    }
    setGitGraphFilter(worktreeId, outcome.filter)
  }
  return revealCommitWhenLoaded(controller, ref.revision)
}
