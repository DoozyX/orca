import { describe, expect, it } from 'vitest'
import { createTestStore } from './store-test-helpers'

const PANE = 'tab-1:leaf-1'
const work = () => [
  { id: 'shell-1', kind: 'command' as const, label: 'Wait for report', firstObservedAt: 5 }
]

describe('agent status monitored work', () => {
  it('stores the list, keeps an unchanged one by reference, and drops a cleared one', () => {
    const store = createTestStore()
    const set = (monitoredWork?: ReturnType<typeof work>) =>
      store.getState().setAgentStatus(
        PANE,
        {
          state: 'working',
          workingMode: 'monitoring',
          prompt: 'p',
          agentType: 'claude',
          monitoredWork
        },
        undefined,
        undefined,
        { tabId: 'tab-1', worktreeId: 'wt-1' }
      )

    set(work())
    const first = store.getState().agentStatusByPaneKey[PANE]?.monitoredWork
    expect(first).toEqual(work())

    set(work())
    expect(store.getState().agentStatusByPaneKey[PANE]?.monitoredWork).toBe(first)

    set(undefined)
    expect(store.getState().agentStatusByPaneKey[PANE]?.monitoredWork).toBeUndefined()
  })
})
