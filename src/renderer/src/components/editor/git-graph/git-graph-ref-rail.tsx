import { useEffect, useMemo, useState, type RefObject } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { GitRefTree } from './git-ref-tree'
import { revealCommitWhenLoaded } from './git-graph-reveal-ref'
import { gitGraphOldServerMessage, gitGraphRefVisibilityMessage } from './git-graph-ref-messages'
import { useGitGraphRefOwner, useGitRefTreeSource, type RefRequests } from './git-graph-ref-source'
import {
  isGitGraphRefVisible,
  toggleGitGraphRefVisibility,
  type GitGraphRefVisibilityError
} from './git-graph-ref-visibility'
import type { useGitGraphHistory } from './use-git-graph-history'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'

type RailProps = {
  worktreeId: string
  history: ReturnType<typeof useGitGraphHistory>
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
  reloadKey,
  owner,
  requests
}: RailProps & { owner: string; requests: RefObject<RefRequests> }) {
  const t = useTranslate()
  const [refusal, setRefusal] = useState<{ error: GitGraphRefVisibilityError; visible: boolean }>()
  const [pendingRefId, setPendingRefId] = useState<string>()
  const { capable, refs, cappedKeys, allRefs, anyGroupCapped, groupsComplete, error, setQuery } =
    useGitRefTreeSource({
      worktreeId,
      executionHostId: history.controller.executionHostId,
      owner,
      requests,
      enabled: true,
      reloadKey
    })
  useEffect(() => setRefusal(undefined), [history.filter, groupsComplete, anyGroupCapped])
  const currentRefId = history.result?.currentRef?.id
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
    if ('error' in outcome) {
      setRefusal({ error: outcome.error, visible })
      return false
    }
    setRefusal(undefined)
    history.changeFilter(outcome.filter)
    return true
  }
  const jump = async (ref: GitHistoryItemRef) => {
    if (!ref.revision) {
      return
    }
    if (
      !isGitGraphRefVisible(history.filter, ref.id, currentRefId) &&
      !setVisible([ref.id], true)
    ) {
      return
    }
    setPendingRefId(ref.id)
    await revealCommitWhenLoaded(history.controller, ref.revision)
    // A later jump has already replaced this one as the pending row.
    setPendingRefId((id) => (id === ref.id ? undefined : id))
  }
  const notices =
    capable === false
      ? [gitGraphOldServerMessage(t)]
      : [
          error,
          refusal &&
            gitGraphRefVisibilityMessage(t, refusal.error, {
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
