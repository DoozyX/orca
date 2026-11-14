import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createOrchestrationWorkerReleaseHarness } from '../../testing/worker-release.test-support'

export function registerWorkerStartTerminalTargetTests(): void {
  describe('worker-start --terminal target', () => {
    const harness = createOrchestrationWorkerReleaseHarness()
    beforeEach(() => harness.setup())
    afterEach(() => harness.cleanup())

    it('refuses the coordinator terminal by handle', async () => {
      const task = harness.db.createTask({ spec: 'self adoption', runId: harness.activeRunId })

      await expect(
        harness.call('orchestration.workerStart', {
          task: task.id,
          from: 'term_coord',
          terminal: 'term_coord'
        })
      ).rejects.toMatchObject({
        code: 'terminal_is_coordinator',
        message: expect.stringContaining("coordinator's own terminal")
      })
      expect(harness.db.getDispatchContext(task.id)).toBeUndefined()
    })

    it('refuses a different handle that resolves to the coordinator pane', async () => {
      const task = harness.db.createTask({
        spec: 'self adoption alias',
        runId: harness.activeRunId
      })
      vi.spyOn(harness.runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
        handle === 'term_coord' || handle === 'term_coord_alias' ? harness.coordinatorPaneKey : null
      )

      await expect(
        harness.call('orchestration.workerStart', {
          task: task.id,
          from: 'term_coord',
          terminal: 'term_coord_alias'
        })
      ).rejects.toMatchObject({ code: 'terminal_is_coordinator' })
    })
  })

  // Manual inject is another self-adoption path; compare target with caller too.
  describe('orchestration.dispatch --to the caller', () => {
    const harness = createOrchestrationWorkerReleaseHarness()
    beforeEach(() => harness.setup())
    afterEach(() => harness.cleanup())

    it('refuses an injected dispatch aimed at the coordinator handle', async () => {
      vi.spyOn(harness.runtime, 'getOrchestrationDispatchAuthority').mockImplementation(
        (handle) =>
          ({
            terminalHandle: handle,
            paneKey: harness.coordinatorPaneKey,
            processIncarnation: 'runtime_test:term_coord:1'
          }) as never
      )
      const task = harness.db.createTask({ spec: 'self dispatch', runId: harness.activeRunId })

      await expect(
        harness.call('orchestration.dispatch', {
          task: task.id,
          from: 'term_coord',
          to: 'term_coord',
          inject: true
        })
      ).rejects.toMatchObject({ code: 'terminal_is_coordinator' })
      expect(harness.db.getDispatchContext(task.id)).toBeUndefined()
      expect(harness.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
    })

    it('refuses an injected dispatch to a different handle that resolves to the coordinator pane', async () => {
      vi.spyOn(harness.runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
        handle === 'term_coord' || handle === 'term_coord_alias' ? harness.coordinatorPaneKey : null
      )
      vi.spyOn(harness.runtime, 'getOrchestrationDispatchAuthority').mockImplementation(
        (handle) =>
          ({
            terminalHandle: handle,
            paneKey: harness.coordinatorPaneKey,
            processIncarnation: 'runtime_test:term_coord:1'
          }) as never
      )
      const task = harness.db.createTask({
        spec: 'self dispatch alias',
        runId: harness.activeRunId
      })

      await expect(
        harness.call('orchestration.dispatch', {
          task: task.id,
          from: 'term_coord',
          to: 'term_coord_alias',
          inject: true
        })
      ).rejects.toMatchObject({ code: 'terminal_is_coordinator' })
    })

    // Context-only self-dispatch writes no preamble and remains valid for low-level topologies.
    it('still records a context-only dispatch aimed at the coordinator handle', async () => {
      const task = harness.db.createTask({ spec: 'self context', runId: harness.activeRunId })

      const result = (await harness.call('orchestration.dispatch', {
        task: task.id,
        from: 'term_coord',
        to: 'term_coord'
      })) as { dispatch: { id: string; status: string } }

      expect(result.dispatch.status).toBe('dispatched')
      expect(harness.db.getDispatchContextById(result.dispatch.id)?.assignee_handle).toBe(
        'term_coord'
      )
      expect(harness.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
    })

    // Self-injection must refuse regardless of agent detection; without-inject advice cannot authorize it.
    it.each([
      ['the coordinator handle', 'term_coord'],
      ['an alias of the coordinator pane', 'term_coord_alias']
    ])('refuses %s even when no agent is detected', async (_label, target) => {
      vi.spyOn(harness.runtime, 'isTerminalRunningAgent').mockResolvedValue(false)
      vi.spyOn(harness.runtime, 'getOrchestrationDispatchAuthority').mockImplementation(
        (handle) =>
          (handle === 'term_coord_alias'
            ? {
                terminalHandle: handle,
                paneKey: harness.coordinatorPaneKey,
                processIncarnation: 'runtime_test:term_coord:1'
              }
            : null) as never
      )
      const task = harness.db.createTask({
        spec: `self inject ${target}`,
        runId: harness.activeRunId
      })

      await expect(
        harness.call('orchestration.dispatch', {
          task: task.id,
          from: 'term_coord',
          to: target,
          inject: true
        })
      ).rejects.toMatchObject({ code: 'terminal_is_coordinator' })
      expect(harness.db.getDispatchContext(task.id)).toBeUndefined()
    })
  })

  // #29: a session-graph reload remints a live pane's handle while worker-start waits on it.
  describe('a worker start whose pane is reminted while it waits for the agent', () => {
    const h = createOrchestrationWorkerReleaseHarness()
    beforeEach(() => h.setup())
    afterEach(() => h.cleanup())

    it('waits once more on the same process under its new handle and binds the worker to it', async () => {
      vi.spyOn(h.runtime, 'getTerminalHandleForPaneKey').mockImplementation((paneKey) =>
        paneKey === h.workerPaneKey ? 'term_reminted' : null
      )
      vi.mocked(h.runtime.waitForTerminal)
        .mockRejectedValueOnce(new Error('terminal_handle_stale'))
        .mockResolvedValueOnce({
          handle: 'term_reminted',
          condition: 'tui-idle',
          satisfied: true,
          status: 'running',
          exitCode: null
        })
      const task = h.db.createTask({ spec: 'reminted pane', runId: h.activeRunId })

      const result = (await h.call('orchestration.workerStart', {
        task: task.id,
        from: 'term_coord',
        agent: 'codex'
      })) as { dispatchId: string; state: string }

      expect(result.state).toBe('ready')
      expect(h.runtime.waitForTerminal).toHaveBeenLastCalledWith(
        'term_reminted',
        expect.objectContaining({ condition: 'tui-idle' })
      )
      expect(h.db.getWorkerTerminalResourceByOwner(result.dispatchId)?.terminal_handle).toBe(
        'term_reminted'
      )
      expect(h.db.getWorkerDispatch(result.dispatchId)?.agent_terminal_handle).toBe('term_reminted')
    })
  })
}
