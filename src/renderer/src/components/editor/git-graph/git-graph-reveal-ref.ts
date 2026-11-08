import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { gitGraphScope } from '@/lib/git-graph-tab'
import { getRuntimeGitRefs } from '@/runtime/source-control/git/runtime-git-status-client'
import {
  gitGraphHistoryForTab,
  type GitGraphHistoryController
} from './git-graph-history-controller'
import { isGitGraphRefVisible, toggleGitGraphRefVisibility } from './git-graph-ref-visibility'
import { setGitGraphFilter } from './use-git-graph-history'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'

// A jump issued before the first or a filter-triggered load would otherwise find no history.
export function revealCommitWhenLoaded(controller: GitGraphHistoryController, id: string): void {
  const ready = (view: ReturnType<typeof controller.view.getState>) =>
    !view.loading && view.result !== undefined
  if (ready(controller.view.getState())) {
    void controller.reveal(id)
    return
  }
  const stop = controller.view.subscribe((view) => {
    if (view.error !== undefined || ready(view)) {
      stop()
      if (view.error === undefined) {
        void controller.reveal(id)
      }
    }
  })
}

/** Makes `ref` visible in the Git Graph filter, then selects its commit once history is loaded. */
export async function revealGitRefInGitGraph(
  worktreeId: string,
  scope: NonNullable<ReturnType<typeof gitGraphScope>>,
  ref: GitHistoryItemRef
): Promise<void> {
  if (!ref.revision) {
    return
  }
  const controller = gitGraphHistoryForTab(worktreeId)
  const filter = useAppStore.getState().gitGraphFiltersByWorktree?.[worktreeId] ?? 'all'
  const currentRefId = controller.view.getState().result?.currentRef?.id ?? scope.worktree.branch
  if (!isGitGraphRefVisible(filter, ref.id, currentRefId)) {
    try {
      const refs = await getRuntimeGitRefs({
        target: scope.target,
        worktreeId,
        worktreePath: scope.worktree.path,
        connectionId: scope.connectionId ?? undefined
      })
      const outcome = toggleGitGraphRefVisibility({
        filter,
        allRefIds: refs.map((entry) => entry.id),
        currentRefId,
        refIds: [ref.id],
        visible: true
      })
      if ('error' in outcome) {
        toast.message(
          translate(
            'gitGraph.tooManyRefs',
            'The graph can show at most 1,000 chosen branches and tags. Pick fewer to hide.'
          )
        )
        return
      }
      setGitGraphFilter(worktreeId, outcome.filter)
    } catch {
      toast.message(translate('gitGraph.loadFailed', 'Failed to load Git history'))
      return
    }
  }
  revealCommitWhenLoaded(controller, ref.revision)
}
