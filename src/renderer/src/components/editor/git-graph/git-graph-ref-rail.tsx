import { useMemo, useState, type RefObject } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { GitRefTree } from './git-ref-tree'
import { useGitGraphJumpPending } from './use-git-graph-jump-pending'
import { revealCommitWhenLoaded } from './git-graph-reveal-ref'
import { gitGraphOldServerMessage, gitGraphRefVisibilityMessage } from './git-graph-ref-messages'
import { useGitGraphRefOwner, useGitRefTreeSource, type RefRequests } from './git-graph-ref-source'
import {
  isGitGraphRefVisible,
  toggleGitGraphRefVisibility,
  type GitGraphRefVisibilityError
} from './git-graph-ref-visibility'
import type { useGitGraphHistory } from './use-git-graph-history'
import type {
  GitHistoryItemRef,
  GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'

type Refusal = {
  reason: GitGraphRefVisibilityError
  visible: boolean
  filter: GitHistoryRefs
  groupsComplete: boolean
  anyGroupCapped: boolean
}

type RailProps = {
  worktreeId: string
  // Not the whole history: holding its result would keep replaced pages alive while the rail is open.
  history: Pick<ReturnType<typeof useGitGraphHistory>, 'filter' | 'changeFilter' | 'controller'>
  currentRefId: string | undefined
  reloadKey: number
}

export function GitGraphRefRail(props: RailProps) {
  const { owner, requests } = useGitGraphRefOwner(
    props.worktreeId,
    props.history.controller.executionHostId
  )
  return <GitGraphRefRailForOwner key={owner} {...props} owner={owner} requests={requests} />
}

function GitGraphRefRailForOwner({
  worktreeId,
  history,
  currentRefId,
  reloadKey,
  owner,
  requests
}: RailProps & { owner: string; requests: RefObject<RefRequests> }) {
  const t = useTranslate()
  const [raised, setRaised] = useState<Refusal>()
  const { pendingRefId, runJump } = useGitGraphJumpPending()
  const { capable, refs, cappedKeys, allRefs, anyGroupCapped, groupsComplete, error, setQuery } =
    useGitRefTreeSource({
      worktreeId,
      executionHostId: history.controller.executionHostId,
      owner,
      requests,
      enabled: true,
      reloadKey
    })
  // A refusal describes the filter and ref list it was raised for; it is hidden once either changes.
  const refusal =
    raised &&
    raised.filter === history.filter &&
    raised.groupsComplete === groupsComplete &&
    raised.anyGroupCapped === anyGroupCapped
      ? raised
      : undefined
  const allRefIds = useMemo(
    () => (groupsComplete && allRefs ? allRefs.map((ref) => ref.id) : undefined),
    [groupsComplete, allRefs]
  )
  const chosen = useMemo(
    () => (Array.isArray(history.filter) ? new Set(history.filter) : undefined),
    [history.filter]
  )
  const isVisible = (refId: string) =>
    chosen ? chosen.has(refId) : isGitGraphRefVisible(history.filter, refId, currentRefId)
  const setVisible = (refIds: string[], visible: boolean): boolean => {
    const outcome = toggleGitGraphRefVisibility({
      filter: history.filter,
      allRefIds,
      currentRefId,
      refIds,
      visible
    })
    if ('refusal' in outcome) {
      setRaised({
        reason: outcome.refusal,
        visible,
        filter: history.filter,
        groupsComplete,
        anyGroupCapped
      })
      return false
    }
    setRaised(undefined)
    history.changeFilter(outcome.filter)
    return true
  }
  const jump = async (ref: GitHistoryItemRef) => {
    const { revision } = ref
    if (!revision) {
      return
    }
    if (
      !isGitGraphRefVisible(history.filter, ref.id, currentRefId) &&
      !setVisible([ref.id], true)
    ) {
      return
    }
    await runJump(ref.id, () => revealCommitWhenLoaded(history.controller, revision))
  }
  const notices =
    capable === false
      ? [gitGraphOldServerMessage(t)]
      : [
          error,
          refusal &&
            gitGraphRefVisibilityMessage(t, refusal.reason, {
              visible: refusal.visible,
              capped: anyGroupCapped
            })
        ].filter((notice): notice is string => Boolean(notice))
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border">
      {notices.map((notice) => (
        <p key={notice} role="status" className="shrink-0 px-3 pt-2 text-xs text-destructive">
          {notice}
        </p>
      ))}
      {refs && (
        <GitRefTree
          refs={refs}
          cappedKeys={cappedKeys}
          currentRefId={currentRefId}
          pendingRefId={pendingRefId}
          isVisible={isVisible}
          onToggle={setVisible}
          onJump={(ref) => void jump(ref)}
          onQueryChange={setQuery}
        />
      )}
    </aside>
  )
}
