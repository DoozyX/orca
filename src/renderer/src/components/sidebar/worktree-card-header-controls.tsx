import React, { useMemo } from 'react'
import { ChevronDown, Workflow } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { cn } from '@/lib/utils'
import { CompactAgentSummaryButton } from './worktree-card-compact-agents'
import type { WorktreeAgentExpansionControls } from './worktree-card-agents-expansion-state'
import { dispatchSuppressScrollAdjustment } from './worktree-card-agent-scroll-suppression'
import { selectSendTargetControlInputs } from './worktree-card-send-target-inputs'
import type { WorktreeCardController } from './use-worktree-card-controller'

export function WorktreeCardHeaderControls({
  card,
  agentExpansion
}: {
  card: WorktreeCardController
  agentExpansion: WorktreeAgentExpansionControls
}): React.JSX.Element | null {
  const {
    worktree,
    showInlineAgentList,
    agentActivityDisplayMode,
    compactInlineAgentRows,
    showLineageChildChip,
    lineageChildAriaLabel,
    lineageCollapsed,
    onLineageToggle,
    childWorkspaceShortLabel
  } = card
  const sendTargetModeActive = useAppStore(
    (state) => selectSendTargetControlInputs(state, worktree.id).targetMode !== null
  )
  const { rootRows, childrenByParentPaneKey } = useMemo(
    () =>
      compactInlineAgentRows.length > 1
        ? buildAgentRowLineageTree(compactInlineAgentRows)
        : { rootRows: compactInlineAgentRows, childrenByParentPaneKey: new Map() },
    [compactInlineAgentRows]
  )
  const summaryAgents = childrenByParentPaneKey.size > 0 ? rootRows : compactInlineAgentRows
  const showAgentDisclosure =
    showInlineAgentList &&
    agentActivityDisplayMode === 'compact' &&
    summaryAgents.length > 1 &&
    !sendTargetModeActive

  if (!showAgentDisclosure && !showLineageChildChip) {
    return null
  }

  return (
    <div className="flex shrink-0 items-center gap-1 pt-px" data-worktree-card-header-controls="">
      {showAgentDisclosure && (
        <CompactAgentSummaryButton
          agents={summaryAgents}
          subjectLabel={`${summaryAgents.length} agents`}
          expanded={agentExpansion.compactRootListExpanded}
          onToggle={() => {
            dispatchSuppressScrollAdjustment()
            agentExpansion.toggleCompactRootList()
          }}
          placement="header"
        />
      )}

      {showLineageChildChip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex h-[18px] max-w-24 shrink-0 items-center gap-1 rounded-sm border border-worktree-sidebar-border bg-worktree-sidebar px-1.5 text-[10px] font-medium leading-none text-muted-foreground hover:bg-worktree-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
              aria-label={lineageChildAriaLabel}
              aria-expanded={!lineageCollapsed}
              onClick={onLineageToggle}
            >
              <Workflow className="size-2.5" />
              <span className="truncate">{childWorkspaceShortLabel}</span>
              <ChevronDown
                className={cn('size-2.5 transition-transform', lineageCollapsed && '-rotate-90')}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {lineageCollapsed
              ? translate(
                  'auto.components.sidebar.WorktreeCard.8cb634cda6',
                  'Show child workspaces'
                )
              : translate(
                  'auto.components.sidebar.WorktreeCard.57eaa61b55',
                  'Hide child workspaces'
                )}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
