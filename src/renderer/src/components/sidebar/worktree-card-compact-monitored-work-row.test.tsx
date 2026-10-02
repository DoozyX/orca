import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { CompactAgentRow } from './worktree-card-compact-agents'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      cacheTimerByKey: {},
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      settings: { promptCacheTimerEnabled: false }
    })
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

const agent: DashboardAgentRowData = {
  paneKey: 'tab-1:monitored-shell-1',
  tab: {
    id: 'tab-1',
    ptyId: null,
    worktreeId: 'wt-1',
    title: 'Parent',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  },
  agentType: 'unknown',
  rowSource: 'monitored-work',
  state: 'working',
  startedAt: 1000,
  activationPaneKey: 'tab-1:parent',
  detail: 'until [ -f report.md ]; do sleep 30; done',
  entry: {
    paneKey: 'tab-1:monitored-shell-1',
    state: 'working',
    workingMode: 'monitoring',
    prompt: 'Wait for report',
    updatedAt: 1000,
    stateStartedAt: 1000,
    stateHistory: [],
    orchestration: {
      taskId: 'monitored:shell-1',
      dispatchId: 'monitored:shell-1',
      parentPaneKey: 'tab-1:parent'
    }
  }
}

describe('CompactAgentRow for monitored work', () => {
  it('shows its label and age, with the command on hover', () => {
    const markup = renderToStaticMarkup(
      <CompactAgentRow agent={agent} now={301_000} onActivate={vi.fn()} />
    )

    // The state dot carries the monitoring indicator; the text is the label alone.
    expect(markup).toContain('aria-label="Monitoring background tasks"')
    expect(markup).toMatch(
      /title="until \[ -f report\.md \]; do sleep 30; done"><span[^>]*>Wait for report<\/span><\/span>/
    )
    expect(markup).toContain('>5m<')
  })
})
