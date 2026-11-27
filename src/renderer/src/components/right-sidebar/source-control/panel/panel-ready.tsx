import { SourceControlBranchPicker } from '../branches/SourceControlBranchPicker'
import { BulkActionBar } from '../commit/bulk-action-bar'
import { SourceControlHeaderToolbar } from './header-toolbar'
import { SourceControlNotesShelf } from '../notes/notes-shelf'
import { SourceControlPanelContent } from './panel-content'
import { SourceControlPanelDialogs } from './panel-dialogs'
import { SourceControlChangeScopeBar } from './change-scope-bar'
import { GitGraphOpenButton, useGitGraphSupport } from '../sync/git-graph-open-button'
import { BranchesTagsSection } from '../sync/branches-tags-section'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import { openGitGraph } from '@/lib/source-control/graph/git-graph-tab'
import type { SourceControlPanelReadyProps } from './panel-props'
import { cn } from '@/lib/class-names'
import {
  SourceControlHeaderOverflowMenu,
  type SourceControlPanelActions
} from './header-overflow-menu'
import { useSourceControlScope } from './worktree-scope'

export function SourceControlPanelReady(props: SourceControlPanelReadyProps) {
  const { activeWorktree, currentWorktreeId, model, worktreePath } = props
  const {
    activeGroupId,
    activeWorktreeId,
    branchLineTotal,
    branchSummary,
    bulkStagePaths,
    bulkUnstagePaths,
    clearSelection,
    collapsedSections,
    compareBaseRef,
    deleteDiffComment,
    diffCommentCount,
    diffCommentsCopied,
    diffCommentsExpanded,
    diffCommentsForActive,
    filterExpanded,
    filterQuery,
    gitIdentityDisplay,
    handleBulkStage,
    handleBulkUnstage,
    handleCopyDiffComments,
    handleCreatePrHeaderClick,
    handleOpenComment,
    handleRelinkSuppressedGitHubPR,
    handleSourceControlKeyDown,
    handleToggleSourceControlViewMode,
    hostedReview,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isExecutingBulk,
    openHostedReviewInChecks,
    prGenerating,
    isGitHistoryVisible,
    refreshBranchCompare,
    resolveSplitTargetGroupId,
    selectedKeys,
    setBaseRefDialogOpen,
    setDiffCommentsExpanded,
    setFileListScrollElement,
    setFilterExpanded,
    setFilterQuery,
    setPendingDiffCommentsClear,
    setSourceControlRoot,
    settings,
    sourceControlViewMode,
    suppressedGitHubPRState,
    toggleSection,
    visibleCreatePrHeaderAction
  } = model
  // One probe per panel: the header Graph button and the scope menu's Graph item share it.
  const graphSupport = useGitGraphSupport(currentWorktreeId, isGitHistoryVisible)
  // A folder card's header owns filter, Graph and overflow; the selected panel's file-list header does.
  const scope = useSourceControlScope()
  const embedded = scope !== null
  // A folder card's Graph opens in the folder workspace that shows the card.
  const placementWorkspaceId = scope?.placementWorkspaceId
  const openGraph = (event?: SourceControlRowOpenEvent): void => {
    void openGitGraph(currentWorktreeId, {
      resolveTargetGroupId: () => resolveSplitTargetGroupId(event),
      placementWorkspaceId
    })
  }
  // Folder sections sit in cards, so the dock matches the card instead of the sidebar.
  const dockBackground = embedded ? 'bg-card/95' : 'bg-sidebar/95'
  const panelActions: SourceControlPanelActions = {
    sourceControlViewMode,
    viewModeToggleDisabled: settings === null,
    onToggleViewMode: handleToggleSourceControlViewMode,
    onChangeBaseRef: () => setBaseRefDialogOpen(true),
    onRefreshBranchCompare: () => void refreshBranchCompare(),
    branchCompareRefreshDisabled: !branchSummary || branchSummary.status === 'loading',
    diffCommentCount,
    onExpandNotes: () => setDiffCommentsExpanded(true),
    onOpenGitGraph: isGitHistoryVisible ? () => openGraph() : undefined,
    gitGraphDisabled: graphSupport.support !== true
  }
  const filter = {
    filterQuery,
    filterExpanded,
    onFilterQueryChange: setFilterQuery,
    onFilterExpandedChange: setFilterExpanded
  }

  // Sits under the commit composer, so it renders inside the scrolling content.
  const fileListHeader = isGitHistoryVisible ? (
    <SourceControlChangeScopeBar
      {...props}
      graphSupported={graphSupport.support === true}
      filter={embedded ? null : filter}
      graphControl={
        embedded ? null : (
          <GitGraphOpenButton
            worktreeId={currentWorktreeId}
            support={graphSupport}
            onOpen={openGraph}
            iconOnly
          />
        )
      }
      overflowMenu={
        embedded ? null : (
          <SourceControlHeaderOverflowMenu panelActions={panelActions} triggerClassName="size-5" />
        )
      }
    />
  ) : null

  return (
    <>
      <div
        ref={setSourceControlRoot}
        className={
          model.scope
            ? 'relative flex flex-col overflow-hidden'
            : 'relative flex h-full flex-col overflow-hidden'
        }
        onKeyDown={handleSourceControlKeyDown}
      >
        <SourceControlHeaderToolbar
          headControl={
            gitIdentityDisplay?.kind === 'branch' ? (
              <SourceControlBranchPicker model={model} />
            ) : undefined
          }
          {...filter}
          visibleCreatePrHeaderAction={visibleCreatePrHeaderAction}
          hostedReview={hostedReview}
          isCreatePrIntentInFlight={isCreatePrIntentInFlight}
          isCreatingPr={isCreatingPr || prGenerating}
          onCreatePrHeaderClick={handleCreatePrHeaderClick}
          onOpenHostedReviewInChecks={openHostedReviewInChecks}
          suppressedGitHubPRNumber={
            suppressedGitHubPRState?.status === 'matched' ? suppressedGitHubPRState.number : null
          }
          onRelinkSuppressedGitHubPR={handleRelinkSuppressedGitHubPR}
          panelActions={panelActions}
          onRefreshBranchCompare={panelActions.onRefreshBranchCompare}
          branchSummary={branchSummary}
          branchLineTotal={branchLineTotal}
          compareBaseRef={compareBaseRef}
          headDisplay={gitIdentityDisplay}
          rebase={
            model.baseRebaseState.kind === 'none'
              ? null
              : {
                  state: model.baseRebaseState,
                  isAbortingRebase: model.isAbortingOperation,
                  isContinuingRebase: model.isContinuingRebase,
                  isRetryingRebaseInspect: model.isRetryingRebaseInspect,
                  hasGitOwner: !!model.activeRepoTarget,
                  onAbortRebase: () => void model.handleAbortRebase(),
                  onContinueRebase: () => void model.handleContinueRebase(),
                  onRetryRebaseInspect: model.handleRetryRebaseInspect
                }
          }
          graphControl={
            isGitHistoryVisible ? (
              <GitGraphOpenButton
                worktreeId={currentWorktreeId}
                support={graphSupport}
                onOpen={openGraph}
              />
            ) : null
          }
          toolsInFileListHeader={isGitHistoryVisible}
        />

        {activeWorktreeId && worktreePath && diffCommentCount > 0 && (
          <SourceControlNotesShelf
            activeWorktreeId={activeWorktreeId}
            activeGroupId={activeGroupId}
            diffCommentsForActive={diffCommentsForActive}
            diffCommentCount={diffCommentCount}
            diffCommentsExpanded={diffCommentsExpanded}
            setDiffCommentsExpanded={setDiffCommentsExpanded}
            diffCommentsCopied={diffCommentsCopied}
            handleCopyDiffComments={handleCopyDiffComments}
            setPendingDiffCommentsClear={setPendingDiffCommentsClear}
            deleteDiffComment={deleteDiffComment}
            handleOpenComment={handleOpenComment}
          />
        )}

        <div
          ref={setFileListScrollElement}
          className={cn(
            // Focused controls after the sticky file-list header scroll clear of it. Sections stay
            // direct children: the virtualized lists re-measure their offset from scroller children.
            'relative flex flex-1 flex-col overflow-auto scrollbar-sleek pt-1 [&>[data-file-list-header]~*_*]:scroll-mt-[38px]',
            // Scroll anchoring would re-anchor to a vanished result row and move the stuck filter input.
            !embedded && (filterExpanded || filterQuery.trim()) && '[overflow-anchor:none]'
          )}
          style={{ paddingBottom: selectedKeys.size > 0 ? 50 : undefined }}
        >
          <SourceControlPanelContent {...props} fileListHeader={fileListHeader} />
          {isGitHistoryVisible && graphSupport.support === true ? (
            // Dock refs as reference context while the rest of the pane scrolls.
            <div
              className={`sticky bottom-0 z-10 mt-auto shrink-0 border-t border-border ${dockBackground} backdrop-blur-sm`}
            >
              <BranchesTagsSection
                worktreeId={currentWorktreeId}
                currentRefId={activeWorktree.branch}
                collapsed={collapsedSections.has('refs')}
                onToggle={() => toggleSection('refs')}
              />
            </div>
          ) : null}
        </div>

        {selectedKeys.size > 0 && (
          <BulkActionBar
            selectedCount={selectedKeys.size}
            stageableCount={bulkStagePaths.length}
            unstageableCount={bulkUnstagePaths.length}
            onStage={handleBulkStage}
            onUnstage={handleBulkUnstage}
            onClear={clearSelection}
            isExecuting={isExecutingBulk}
          />
        )}
      </div>

      <SourceControlPanelDialogs {...props} />
    </>
  )
}
