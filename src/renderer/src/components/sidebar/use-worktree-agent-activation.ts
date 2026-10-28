import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateTerminalTabOnOwner } from '@/lib/terminal-tab-owner-activation'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { dismissStaleAgentRowByKey } from '../terminal-pane/stale-agent-row'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { stablePaneHasLivePty } from '@/lib/sleeping-agent-pane-ownership'

export function useWorktreeAgentActivation(worktreeId: string): {
  handleActivateAgentTab: (tabId: string, paneKey: string) => void
  handleActivateRetainedAgent: (tabId: string, paneKey: string) => void
} {
  const handleActivateAgentTab = useCallback(
    (tabId: string, paneKey: string) => {
      const parsed = parsePaneKey(paneKey)
      if (!parsed) {
        // Legacy/malformed pane keys cannot resolve after replay; discard stale rows rather than guessing.
        console.warn('[WorktreeCardAgents] malformed paneKey, skipping pane focus', paneKey)
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      if (parsed.tabId !== tabId) {
        console.warn('[WorktreeCardAgents] paneKey tabId mismatch, dismissing row', {
          tabId,
          paneKey
        })
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      // Use shared activation for cross-repo reveal and navigation history.
      activateAndRevealWorktree(worktreeId)
      const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
      if (tabs.some((t) => t.id === tabId)) {
        activateTabAndFocusPane(tabId, parsed.leafId, {
          ackPaneKeyOnSuccess: paneKey,
          flashFocusedPane: true,
          scrollToBottomIfOutputSinceLastView: true
        })
        activateTerminalTabOnOwner(worktreeId, tabId, parsed.leafId)
      } else if (!activateStructuredAgentSessionTab({ worktreeId, tabId })) {
        const liveEntry = useAppStore.getState().agentStatusByPaneKey[paneKey]
        if (liveEntry?.worktreeId === worktreeId) {
          // Live worker status can precede tab hydration; retain the row and activate its owning terminal.
          activateTerminalTabOnOwner(worktreeId, tabId, parsed.leafId)
          return
        }
        dismissStaleAgentRowByKey(paneKey)
      }
    },
    [worktreeId]
  )
  const handleActivateRetainedAgent = useCallback(
    (tabId: string, paneKey: string) => {
      const parsed = parsePaneKey(paneKey)
      const state = useAppStore.getState()
      // Retained rows are completion evidence; only open a still-live pane so a sleeping target pane is never resumed.
      if (
        parsed?.tabId === tabId &&
        state.tabsByWorktree[worktreeId]?.some((tab) => tab.id === tabId) &&
        stablePaneHasLivePty(
          tabId,
          parsed.leafId,
          state.ptyIdsByTabId,
          state.terminalLayoutsByTabId[tabId]
        )
      ) {
        handleActivateAgentTab(tabId, paneKey)
      }
    },
    [handleActivateAgentTab, worktreeId]
  )
  return { handleActivateAgentTab, handleActivateRetainedAgent }
}
