import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { buildDerivedChildRows } from './worktree-monitored-work-child-rows'

const tab: TerminalTab = {
  id: 'parent-tab',
  ptyId: null,
  worktreeId: 'folder-workspace',
  title: 'Parent',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

const parentEntry: AgentStatusEntry = {
  paneKey: 'parent-pane',
  tabId: tab.id,
  worktreeId: tab.worktreeId,
  state: 'working',
  workingMode: 'monitoring',
  prompt: 'parent prompt',
  updatedAt: 100,
  stateStartedAt: 10,
  stateHistory: [],
  monitoredWork: [
    {
      id: 'shell-1',
      kind: 'command',
      label: 'Wait for fix-468 report',
      detail: 'until [ -f report.md ]; do sleep 30; done',
      firstObservedAt: 40
    },
    { id: 'cron-1', kind: 'cron', detail: '*/30 * * * * · recurring', firstObservedAt: 50 }
  ]
}

describe('monitored-work child rows', () => {
  it('lists each item under a working parent, aged from first observation', () => {
    const rows = buildDerivedChildRows({
      parentEntry,
      parentState: 'working',
      tab,
      parentIsFresh: true
    })

    expect(rows.map((row) => [row.rowSource, row.entry.prompt, row.detail, row.startedAt])).toEqual(
      [
        [
          'monitored-work',
          'Wait for fix-468 report',
          'until [ -f report.md ]; do sleep 30; done',
          40
        ],
        ['monitored-work', '*/30 * * * * · recurring', '*/30 * * * * · recurring', 50]
      ]
    )
    for (const row of rows) {
      expect(row.state).toBe('working')
      expect(row.entry.workingMode).toBe('monitoring')
      expect(row.activationPaneKey).toBe('parent-pane')
      expect(row.entry.orchestration?.parentPaneKey).toBe('parent-pane')
      expect(row.paneKey).not.toBe('parent-pane')
    }
    expect(new Set(rows.map((row) => row.paneKey)).size).toBe(2)
  })

  it('lists nothing once the parent row is no longer working', () => {
    for (const parentState of ['done', 'idle', 'unverifiable', 'waiting'] as const) {
      expect(buildDerivedChildRows({ parentEntry, parentState, tab, parentIsFresh: true })).toEqual(
        []
      )
    }
  })

  it('keeps subagent rows ahead of monitored work', () => {
    const rows = buildDerivedChildRows({
      parentEntry: {
        ...parentEntry,
        subagents: [{ id: 'child', state: 'working', startedAt: 20, description: 'reviewer' }]
      },
      parentState: 'working',
      tab,
      parentIsFresh: true
    })

    expect(rows.map((row) => row.rowSource)).toEqual([
      'subagent',
      'monitored-work',
      'monitored-work'
    ])
  })
})
