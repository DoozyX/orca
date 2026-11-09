import { useEffect, useState } from 'react'
import { openGitGraph, GIT_GRAPH_REFRESH_EVENT } from '@/lib/git-graph-tab'
import { useTranslate } from '@/i18n/use-translate'
import { GitRefTree } from '@/components/editor/git-graph/git-ref-tree'
import { gitGraphOldServerMessage } from '@/components/editor/git-graph/git-graph-ref-messages'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useGitGraphJumpPending } from '@/components/editor/git-graph/use-git-graph-jump-pending'
import { revealGitRefInGitGraph } from '@/components/editor/git-graph/git-graph-reveal-ref'
import {
  useGitGraphRefOwner,
  useGitRefTreeSource
} from '@/components/editor/git-graph/git-graph-ref-source'
import type { GitHistoryItemRef } from '../../../../../../shared/git/history/git-history-types'
import { DockSectionToggle } from './dock-section-toggle'

export function BranchesTagsSection({
  worktreeId,
  currentRefId,
  collapsed,
  onToggle
}: {
  worktreeId: string
  currentRefId?: string
  collapsed: boolean
  onToggle: () => void
}) {
  const t = useTranslate()
  const { owner, requests } = useGitGraphRefOwner(worktreeId)
  // Each expand and each Git Graph refresh refetches, so failed groups retry and moved tips update.
  const [reloadKey, setReloadKey] = useState(0)
  const { pendingRefId, runJump } = useGitGraphJumpPending()
  useEffect(() => {
    const onRefresh = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === worktreeId) {
        setReloadKey((key) => key + 1)
      }
    }
    window.addEventListener(GIT_GRAPH_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(GIT_GRAPH_REFRESH_EVENT, onRefresh)
  }, [worktreeId])
  const { capable, refs, cappedKeys, allRefs, anyGroupCapped, error, setQuery } =
    useGitRefTreeSource({
      worktreeId,
      owner,
      requests,
      enabled: !collapsed,
      reloadKey
    })
  const jump = (ref: GitHistoryItemRef) =>
    runJump(ref.id, () =>
      openGitGraph(worktreeId, {
        afterOpen: async (scope) => {
          await revealGitRefInGitGraph(worktreeId, scope, ref)
        }
      })
    )
  return (
    <div className="border-b border-border">
      <div className="h-7 pl-1 pr-3">
        <DockSectionToggle
          label={t('gitGraph.branchesAndTags', 'Branches & Tags')}
          collapsed={collapsed}
          onToggle={() => {
            if (collapsed) {
              setReloadKey((key) => key + 1)
            }
            onToggle()
          }}
          count={
            allRefs && (
              <span className="text-3xs font-medium tabular-nums">
                {allRefs.length}
                {anyGroupCapped && '+'}
              </span>
            )
          }
        />
      </div>
      {!collapsed && (
        <div className="flex flex-col" style={{ height: 'min(192px, 25vh)' }}>
          {capable === false ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{gitGraphOldServerMessage(t)}</p>
          ) : (
            <>
              {error && <p className="shrink-0 px-3 py-2 text-xs text-destructive">{error}</p>}
              {!refs && !error && (
                <p className="flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <LoadingSpinner className="size-3.5" />
                  {t('gitGraph.loadingRefs', 'Loading branches and tags…')}
                </p>
              )}
              {refs && (
                <div className="min-h-0 flex-1">
                  <GitRefTree
                    refs={refs}
                    cappedKeys={cappedKeys}
                    currentRefId={currentRefId}
                    pendingRefId={pendingRefId}
                    onJump={(ref) => void jump(ref)}
                    onQueryChange={setQuery}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
