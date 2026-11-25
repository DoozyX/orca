import { SourceControlBranchPicker } from '../branches/SourceControlBranchPicker'
import { BulkActionBar } from '../commit/bulk-action-bar'
import { SourceControlHeaderToolbar } from './header-toolbar'
import { SourceControlNotesShelf } from '../notes/notes-shelf'
import { SourceControlPanelContent } from './panel-content'
import { SourceControlPanelDialogs } from './panel-dialogs'
import { SourceControlChangeScopeBar } from './change-scope-bar'
import { GitGraphOpenButton, useGitGraphSupport } from '../sync/git-graph-open-button'
import { BranchesTagsSection } from '../sync/branches-tags-section'
import { useSourceControlScope } from './worktree-scope'
import { openGitGraph } from '@/lib/source-control/graph/git-graph-tab'
import type { SourceControlPanelReadyProps } from './panel-props'

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
    manualReviewUrl,
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
  // Folder sections sit in cards, so the dock matches the card instead of the sidebar.
  const dockBackground = useSourceControlScope() ? 'bg-card/95' : 'bg-sidebar/95'

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
          filterQuery={filterQuery}
          filterExpanded={filterExpanded}
          onFilterQueryChange={setFilterQuery}
          onFilterExpandedChange={setFilterExpanded}
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
          sourceControlViewMode={sourceControlViewMode}
          viewModeToggleDisabled={settings === null}
          onToggleViewMode={handleToggleSourceControlViewMode}
          onChangeBaseRef={() => setBaseRefDialogOpen(true)}
          onRefreshBranchCompare={() => void refreshBranchCompare()}
          branchCompareRefreshDisabled={!branchSummary || branchSummary.status === 'loading'}
          diffCommentCount={diffCommentCount}
          onExpandNotes={() => setDiffCommentsExpanded(true)}
          branchSummary={branchSummary}
          branchLineTotal={branchLineTotal}
          compareBaseRef={compareBaseRef}
          headDisplay={gitIdentityDisplay}
          manualReviewUrl={manualReviewUrl}
          rebase={
            model.baseRebaseState.kind === 'none'
              ? null
              : {
                  state: model.baseRebaseState,
                  isRebasing:
                    model.isRemoteOperationActive && model.inFlightRemoteOpKind === 'rebase',
                  isAbortingRebase: model.isAbortingOperation,
                  isContinuingRebase: model.isContinuingRebase,
                  isRetryingRebaseInspect: model.isRetryingRebaseInspect,
                  hasGitOwner: !!model.activeRepoTarget,
                  onRebase: () => model.handleActionInvoke('rebase_base'),
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
                onOpen={(event) => {
                  void openGitGraph(currentWorktreeId, {
                    resolveTargetGroupId: () => resolveSplitTargetGroupId(event)
                  })
                }}
              />
            ) : null
          }
        />

        {isGitHistoryVisible ? (
          <SourceControlChangeScopeBar {...props} graphSupported={graphSupport.support === true} />
        ) : null}

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
          className="relative flex flex-1 flex-col overflow-auto scrollbar-sleek pt-1"
          style={{ paddingBottom: selectedKeys.size > 0 ? 50 : undefined }}
        >
          <SourceControlPanelContent {...props} />
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
