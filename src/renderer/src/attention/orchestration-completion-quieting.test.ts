import { describe, expect, it } from 'vitest'
import type { AgentStatusOrchestrationContext } from '../../../shared/agent-status-types'
import type { OrchestrationFleetAttentionCategory } from '../../../shared/orchestration-fleet-attention'
import {
  resolveOrchestrationCompletionBanner,
  type OrchestrationCompletionInput
} from './orchestration-completion-quieting'

const COORDINATOR = 'tab-c:leaf-c'
const WORKER = 'tab-w:leaf-w'

function context(
  overrides: Partial<AgentStatusOrchestrationContext> = {}
): AgentStatusOrchestrationContext {
  return { taskId: 'task_1', dispatchId: 'dispatch_1', ...overrides }
}

function worker(overrides: Partial<AgentStatusOrchestrationContext> = {}) {
  return context({ parentPaneKey: COORDINATOR, dispatchStatus: 'dispatched', ...overrides })
}

type QuietInput = Omit<
  OrchestrationCompletionInput,
  'announcedFailedDispatchIds' | 'runWorkerPaneKeys'
> &
  Partial<Pick<OrchestrationCompletionInput, 'announcedFailedDispatchIds' | 'runWorkerPaneKeys'>>

function isQuiet(input: QuietInput): boolean {
  return resolveOrchestrationCompletionBanner({
    announcedFailedDispatchIds: new Set(),
    runWorkerPaneKeys: {},
    ...input
  }).quiet
}

function failedWorker(categories: OrchestrationFleetAttentionCategory[]) {
  return {
    [WORKER]: worker({
      dispatchStatus: 'failed',
      attention: { categories, requiresAction: true }
    })
  }
}

describe('resolveOrchestrationCompletionBanner', () => {
  it('quiets a worker done with nothing needing attention', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({ attention: { categories: [], requiresAction: false } })
        }
      })
    ).toBe(true)
  })

  it('notifies when the worker requires action', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({ attention: { categories: ['failure'], requiresAction: true } })
        }
      })
    ).toBe(false)
  })

  it('quiets a worker whose only attention is an unacknowledged coordinator message', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({ attention: { categories: ['guidance'], requiresAction: true } })
        }
      })
    ).toBe(true)
  })

  it('notifies when guidance comes with attention the user owes', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({
            attention: { categories: ['guidance', 'approval'], requiresAction: true }
          })
        }
      })
    ).toBe(false)
  })

  it('announces a failed dispatch once, then quiets the pane’s later turns', () => {
    const input = {
      paneKey: WORKER,
      agentState: 'done' as const,
      orchestrationByPaneKey: failedWorker(['failure']),
      runWorkerPaneKeys: {}
    }

    expect(
      resolveOrchestrationCompletionBanner({ ...input, announcedFailedDispatchIds: new Set() })
    ).toEqual({ quiet: false, announcesFailedDispatchId: 'dispatch_1' })
    expect(isQuiet({ ...input, announcedFailedDispatchIds: new Set(['dispatch_1']) })).toBe(true)
  })

  it('still notifies when other user attention joins an announced failure', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: failedWorker(['failure', 'interruption']),
        announcedFailedDispatchIds: new Set(['dispatch_1'])
      })
    ).toBe(false)
  })

  it('quiets a top-level worker that succeeded', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({
            attention: { categories: ['root_completion'], requiresAction: false }
          })
        }
      })
    ).toBe(true)
  })

  it('notifies when the worker attention projection has not arrived', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker() }
      })
    ).toBe(false)
  })

  it.each(['blocked', 'waiting', 'working'] as const)('never gates a %s state', (agentState) => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState,
        orchestrationByPaneKey: {
          [WORKER]: worker({ attention: { categories: [], requiresAction: false } })
        }
      })
    ).toBe(false)
  })

  it('never gates an unknown agent state', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: undefined,
        orchestrationByPaneKey: {
          [WORKER]: worker({ attention: { categories: [], requiresAction: false } })
        }
      })
    ).toBe(false)
  })

  it('quiets a coordinator while a child dispatch is still in flight', () => {
    expect(
      isQuiet({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({ dispatchStatus: 'dispatched' }),
          'tab-x:leaf-x': worker({ dispatchStatus: 'completed' })
        }
      })
    ).toBe(true)
  })

  it('treats a pending child dispatch as in flight', () => {
    expect(
      isQuiet({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker({ dispatchStatus: 'pending' }) }
      })
    ).toBe(true)
  })

  it('notifies for a coordinator once every child dispatch has settled', () => {
    expect(
      isQuiet({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({ dispatchStatus: 'completed' }),
          'tab-x:leaf-x': worker({ dispatchStatus: 'failed' })
        }
      })
    ).toBe(false)
  })

  it('does not count a child context with no dispatch status as in flight', () => {
    expect(
      isQuiet({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker({ dispatchStatus: undefined }) }
      })
    ).toBe(false)
  })

  it('does not quiet a pane that another coordinator supervises', () => {
    expect(
      isQuiet({
        paneKey: 'tab-other:leaf-other',
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker({ dispatchStatus: 'dispatched' }) }
      })
    ).toBe(false)
  })

  it('quiets a run member whose settled dispatch has left the display window', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {},
        runWorkerPaneKeys: { [WORKER]: true }
      })
    ).toBe(true)
  })

  it('still notifies a run member that is blocked on the user', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'blocked',
        orchestrationByPaneKey: {},
        runWorkerPaneKeys: { [WORKER]: true }
      })
    ).toBe(false)
  })

  it('leaves a pane outside any orchestration run alone', () => {
    expect(
      isQuiet({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {}
      })
    ).toBe(false)
  })

  it('leaves an event with no pane key alone', () => {
    expect(
      isQuiet({
        paneKey: undefined,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker() }
      })
    ).toBe(false)
  })

  it('treats a pane that is both worker and coordinator as a worker', () => {
    expect(
      isQuiet({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: {
          [COORDINATOR]: context({
            parentPaneKey: 'tab-root:leaf-root',
            dispatchStatus: 'dispatched',
            attention: { categories: ['failure'], requiresAction: true }
          }),
          [WORKER]: worker({ dispatchStatus: 'dispatched' })
        }
      })
    ).toBe(false)
  })
})
