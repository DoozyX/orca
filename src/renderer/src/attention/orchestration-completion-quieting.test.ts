import { describe, expect, it } from 'vitest'
import type { AgentStatusOrchestrationContext } from '../../../shared/agent-status-types'
import { isQuietOrchestrationCompletion } from './orchestration-completion-quieting'

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

describe('isQuietOrchestrationCompletion', () => {
  it('quiets a worker done with nothing needing attention', () => {
    expect(
      isQuietOrchestrationCompletion({
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
      isQuietOrchestrationCompletion({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {
          [WORKER]: worker({ attention: { categories: ['failure'], requiresAction: true } })
        }
      })
    ).toBe(false)
  })

  it('quiets a top-level worker that succeeded', () => {
    expect(
      isQuietOrchestrationCompletion({
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
      isQuietOrchestrationCompletion({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker() }
      })
    ).toBe(false)
  })

  it.each(['blocked', 'waiting', 'working'] as const)('never gates a %s state', (agentState) => {
    expect(
      isQuietOrchestrationCompletion({
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
      isQuietOrchestrationCompletion({
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
      isQuietOrchestrationCompletion({
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
      isQuietOrchestrationCompletion({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker({ dispatchStatus: 'pending' }) }
      })
    ).toBe(true)
  })

  it('notifies for a coordinator once every child dispatch has settled', () => {
    expect(
      isQuietOrchestrationCompletion({
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
      isQuietOrchestrationCompletion({
        paneKey: COORDINATOR,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker({ dispatchStatus: undefined }) }
      })
    ).toBe(false)
  })

  it('does not quiet a pane that another coordinator supervises', () => {
    expect(
      isQuietOrchestrationCompletion({
        paneKey: 'tab-other:leaf-other',
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker({ dispatchStatus: 'dispatched' }) }
      })
    ).toBe(false)
  })

  it('leaves a pane outside any orchestration run alone', () => {
    expect(
      isQuietOrchestrationCompletion({
        paneKey: WORKER,
        agentState: 'done',
        orchestrationByPaneKey: {}
      })
    ).toBe(false)
  })

  it('leaves an event with no pane key alone', () => {
    expect(
      isQuietOrchestrationCompletion({
        paneKey: undefined,
        agentState: 'done',
        orchestrationByPaneKey: { [WORKER]: worker() }
      })
    ).toBe(false)
  })

  it('treats a pane that is both worker and coordinator as a worker', () => {
    expect(
      isQuietOrchestrationCompletion({
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
