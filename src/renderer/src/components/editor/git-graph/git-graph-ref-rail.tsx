import { useEffect, useMemo, useState, type RefObject } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { GitRefTree } from './git-ref-tree'
import { revealCommitWhenLoaded } from './git-graph-reveal-ref'
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
  const [refusal, setRefusal] = useState<GitGraphRefVisibilityError>()
  const { capable, refs, cappedKeys, allRefs, anyGroupCapped, error, setQuery } =
    useGitRefTreeSource({
      worktreeId,
      executionHostId: history.controller.executionHostId,
      owner,
      requests,
      enabled: true,
      reloadKey
    })
  useEffect(() => setRefusal(undefined), [history.filter])
  const currentRefId = history.result?.currentRef?.id
  const allRefIds = useMemo(() => allRefs?.map((ref) => ref.id) ?? [], [allRefs])
  const setVisible = (refIds: string[], visible: boolean): boolean => {
    // A capped group cannot name every ref, so hiding one from All would drop the unlisted ones.
    if (!visible && history.filter === 'all' && anyGroupCapped) {
      setRefusal('too-many-refs')
      return false
    }
    const outcome = toggleGitGraphRefVisibility({
      filter: history.filter,
      allRefIds,
      currentRefId,
      refIds,
      visible
    })
    if ('error' in outcome) {
      setRefusal(outcome.error)
      return false
    }
    setRefusal(undefined)
    history.changeFilter(outcome.filter)
    return true
  }
  const jump = (ref: GitHistoryItemRef) => {
    if (!ref.revision) {
      return
    }
    if (
      !isGitGraphRefVisible(history.filter, ref.id, currentRefId) &&
      !setVisible([ref.id], true)
    ) {
      return
    }
    revealCommitWhenLoaded(history.controller, ref.revision)
  }
  const notice =
    capable === false
      ? t('gitGraph.oldServer', "This server's Orca version shows only the current branch")
      : error
        ? error
        : refusal === 'last-visible'
          ? t('gitGraph.lastVisibleRef', 'At least one branch or tag must stay visible')
          : refusal === 'too-many-refs'
            ? t(
                'gitGraph.tooManyRefs',
                'The graph can show at most 1,000 chosen branches and tags. Pick fewer to hide.'
              )
            : undefined
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border">
      {notice && (
        <p role="status" className="shrink-0 px-3 pt-2 text-xs text-destructive">
          {notice}
        </p>
      )}
      {refs && (
        <GitRefTree
          refs={refs}
          cappedKeys={cappedKeys}
          currentRefId={currentRefId}
          isVisible={(refId) => isGitGraphRefVisible(history.filter, refId, currentRefId)}
          onToggle={setVisible}
          onJump={jump}
          onQueryChange={setQuery}
        />
      )}
    </aside>
  )
}
