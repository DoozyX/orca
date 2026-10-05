import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchTerminalNotification } from './use-notification-dispatch'
import {
  PANE_KEY,
  resetNotificationDispatchMockState,
  type NotificationDispatchMockState
} from './notification-dispatch-test-harness'

vi.mock('@/store', async () => {
  const harness = await import('./notification-dispatch-test-harness')
  return harness.createNotificationDispatchStoreModuleMock()
})

vi.mock('@/lib/desktop-notification-sound', async () => {
  const harness = await import('./notification-dispatch-test-harness')
  return harness.createDesktopNotificationSoundModuleMock()
})

const CHILD_PANE_KEY = 'tab-child:leaf-child'

let mockState: NotificationDispatchMockState

function dispatchCompletion(): void {
  dispatchTerminalNotification('wt-primary', {
    source: 'agent-task-complete',
    terminalTitle: 'codex',
    paneKey: PANE_KEY
  })
}

describe('dispatchTerminalNotification in an orchestration run', () => {
  beforeEach(() => {
    mockState = resetNotificationDispatchMockState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips the banner but still marks unread for a coordinator with a dispatch in flight', () => {
    mockState.runtimeAgentOrchestrationByPaneKey = {
      [CHILD_PANE_KEY]: {
        taskId: 'task_1',
        dispatchId: 'dispatch_1',
        dispatchStatus: 'dispatched',
        parentPaneKey: PANE_KEY
      }
    }

    dispatchCompletion()

    expect(window.api.notifications.dispatch).not.toHaveBeenCalled()
    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalledWith(
      PANE_KEY,
      'agent-completion'
    )
  })

  it('delivers the banner once the coordinator has no dispatch in flight', () => {
    mockState.runtimeAgentOrchestrationByPaneKey = {
      [CHILD_PANE_KEY]: {
        taskId: 'task_1',
        dispatchId: 'dispatch_1',
        dispatchStatus: 'completed',
        parentPaneKey: PANE_KEY
      }
    }

    dispatchCompletion()

    expect(window.api.notifications.dispatch).toHaveBeenCalledTimes(1)
  })

  it('skips the banner for a worker done with no attention flag', () => {
    mockState.runtimeAgentOrchestrationByPaneKey = {
      [PANE_KEY]: {
        taskId: 'task_1',
        dispatchId: 'dispatch_1',
        dispatchStatus: 'dispatched',
        parentPaneKey: 'tab-root:leaf-root',
        attention: { categories: [], requiresAction: false }
      }
    }

    dispatchCompletion()

    expect(window.api.notifications.dispatch).not.toHaveBeenCalled()
    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
  })

  it('delivers the banner for a worker that requires action', () => {
    mockState.runtimeAgentOrchestrationByPaneKey = {
      [PANE_KEY]: {
        taskId: 'task_1',
        dispatchId: 'dispatch_1',
        dispatchStatus: 'failed',
        parentPaneKey: 'tab-root:leaf-root',
        attention: { categories: ['failure'], requiresAction: true }
      }
    }

    dispatchCompletion()

    expect(window.api.notifications.dispatch).toHaveBeenCalledTimes(1)
  })

  it('banners a failed worker dispatch once, then only marks its later turns unread', () => {
    mockState.runtimeAgentOrchestrationByPaneKey = {
      [PANE_KEY]: {
        taskId: 'task_failed',
        dispatchId: 'dispatch_failed',
        dispatchStatus: 'failed',
        parentPaneKey: 'tab-root:leaf-root',
        attention: { categories: ['failure'], requiresAction: true }
      }
    }

    dispatchCompletion()
    dispatchCompletion()

    expect(window.api.notifications.dispatch).toHaveBeenCalledTimes(1)
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalledTimes(2)
  })

  it('only marks unread for a run member past the display window', () => {
    mockState.runtimeAgentRunWorkerPaneKeys = { [PANE_KEY]: true }

    dispatchCompletion()

    expect(window.api.notifications.dispatch).not.toHaveBeenCalled()
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalledWith(
      PANE_KEY,
      'agent-completion'
    )
  })

  it('delivers a terminal bell for an otherwise quiet worker', () => {
    mockState.runtimeAgentOrchestrationByPaneKey = {
      [PANE_KEY]: {
        taskId: 'task_1',
        dispatchId: 'dispatch_1',
        dispatchStatus: 'dispatched',
        parentPaneKey: 'tab-root:leaf-root',
        attention: { categories: [], requiresAction: false }
      }
    }

    dispatchTerminalNotification('wt-primary', { source: 'terminal-bell', paneKey: PANE_KEY })

    expect(window.api.notifications.dispatch).toHaveBeenCalledTimes(1)
  })
})
