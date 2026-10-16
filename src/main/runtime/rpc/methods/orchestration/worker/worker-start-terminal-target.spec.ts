import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LaunchedAgentForeground } from '../../../../launched-agent-foreground'
import type { RuntimeTerminalWait } from '../../../../../../shared/runtime-terminal-contracts'
import { createOrchestrationWorkerReleaseHarness } from './worker-release.test-support'

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

    it('still accepts a separate agent terminal in the same worktree', async () => {
      const started = await harness.startWorker({ terminal: 'term_worker' })
      expect(started.dispatchId).toEqual(expect.any(String))
    })
  })

  // The other door into the same self-adoption: manual dispatch never compared `to` to the caller.
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

    // Low-level topologies (and the e2e specs that drive them from one pane) dispatch context
    // to the caller's own terminal; nothing is written into the pane, so nothing self-adopts.
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

    // The rejection for a missing agent tells the caller to dispatch without --inject, which the
    // coordinator guard forbids; the self-target answer must not depend on agent presence.
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

    it('still dispatches to a different pane', async () => {
      const task = harness.db.createTask({ spec: 'peer dispatch', runId: harness.activeRunId })
      const result = (await harness.call('orchestration.dispatch', {
        task: task.id,
        from: 'term_coord',
        to: 'term_worker'
      })) as { dispatch: { assignee_pane_key: string } }
      expect(result.dispatch.assignee_pane_key).toBe(harness.workerPaneKey)
    })
  })

  const PTY_ID = 'pty_worker'

  // Why: a shell back at its prompt after the agent exits reads as ready too, so the brief needs the
  // launched agent found in front, or the shell runs it.
  describe('a worker start writes its brief only into the agent it launched', () => {
    const h = createOrchestrationWorkerReleaseHarness()
    afterEach(() => h.cleanup())

    function launchedPane(foreground: LaunchedAgentForeground): string[] {
      h.setup()
      const writes: string[] = []
      vi.spyOn(h.runtime, 'readLaunchedAgentForeground').mockResolvedValue(foreground)
      vi.spyOn(h.runtime, 'launchedAgentHostProvesAgent').mockReturnValue(true)
      vi.spyOn(h.runtime, 'subscribeToTerminalData').mockReturnValue(() => {})
      vi.mocked(h.runtime.sendTerminalAgentPrompt).mockImplementation(
        async (handle, text, options) => {
          await options?.beforeWrite?.(PTY_ID)
          writes.push(text)
          return { handle, accepted: true, bytesWritten: text.length }
        }
      )
      return writes
    }

    it('types nothing when the agent exited and its shell is in front', async () => {
      const writes = launchedPane('shell')

      await expect(h.startWorker({ agent: 'claude' })).rejects.toThrow()
      expect(writes).toEqual([])
    })

    it('writes the brief once into the agent found in front', async () => {
      const writes = launchedPane('agent')

      await h.startWorker({ agent: 'claude' })
      expect(writes).toHaveLength(1)
    })

    // #18/#19: the read right after readiness can still find the launcher in front.
    it('waits out a first read that cannot tell, then writes into the agent', async () => {
      const writes = launchedPane('agent')
      vi.mocked(h.runtime.readLaunchedAgentForeground)
        .mockResolvedValueOnce('unknown')
        .mockResolvedValueOnce('agent')
      const task = h.db.createTask({ spec: 'settling foreground', runId: h.activeRunId })

      const result = await h.call('orchestration.workerStart', {
        task: task.id,
        from: 'term_coord',
        agent: 'claude'
      })

      expect(result).toMatchObject({
        state: 'ready',
        stage: 'input_accepted',
        residualResources: []
      })
      expect(h.runtime.readLaunchedAgentForeground).toHaveBeenCalledTimes(2)
      expect(writes).toHaveLength(1)
    })

    it('leaves a terminal the caller supplied to its own idle wait', async () => {
      const writes = launchedPane('shell')

      await h.startWorker({ terminal: 'term_worker' })
      expect(h.runtime.readLaunchedAgentForeground).not.toHaveBeenCalled()
      expect(writes).toHaveLength(1)
    })
  })

  // #29: a session-graph reload remints a live pane's handle while worker-start waits on it.
  describe('a worker start whose pane is reminted while it waits for the agent', () => {
    const h = createOrchestrationWorkerReleaseHarness()
    afterEach(() => h.cleanup())
    const WORKER_INCARNATION = 'runtime_test:term_worker:1'

    function remintDuringReadiness(pane: { handle: string | null; incarnation: string | null }) {
      h.setup()
      vi.spyOn(h.runtime, 'getTerminalHandleForPaneKey').mockImplementation((paneKey) =>
        paneKey === h.workerPaneKey ? pane.handle : null
      )
      vi.mocked(h.runtime.getTerminalProcessIncarnation).mockImplementation((handle) =>
        handle === 'term_worker'
          ? WORKER_INCARNATION
          : handle === pane.handle
            ? pane.incarnation
            : null
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
    }

    async function start(): Promise<{ dispatchId: string } & Record<string, unknown>> {
      const task = h.db.createTask({ spec: 'reminted pane', runId: h.activeRunId })
      const result = await h.call('orchestration.workerStart', {
        task: task.id,
        from: 'term_coord',
        agent: 'codex'
      })
      expect(result).toMatchObject({ dispatchId: expect.any(String) })
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: asserted to carry a dispatchId just above.
      return result as { dispatchId: string } & Record<string, unknown>
    }

    it('waits once more on the same process under its new handle and binds the worker to it', async () => {
      remintDuringReadiness({ handle: 'term_reminted', incarnation: WORKER_INCARNATION })

      const result = await start()

      expect(result).toMatchObject({ state: 'ready', residualResources: [] })
      expect(h.runtime.waitForTerminal).toHaveBeenCalledTimes(2)
      expect(h.runtime.waitForTerminal).toHaveBeenLastCalledWith(
        'term_reminted',
        expect.objectContaining({ condition: 'tui-idle' })
      )
      expect(h.db.getWorkerTerminalResourceByOwner(result.dispatchId)?.terminal_handle).toBe(
        'term_reminted'
      )
      expect(h.db.getWorkerDispatch(result.dispatchId)?.agent_terminal_handle).toBe('term_reminted')
      expect(h.db.getDispatchContextById(result.dispatchId)?.assignee_handle).toBe('term_reminted')
    })

    it.each([
      ['another process', { handle: 'term_reminted', incarnation: 'runtime_test:term_worker:2' }],
      ['no terminal', { handle: null, incarnation: null }]
    ])('fails at agent readiness as before when the pane now holds %s', async (_label, pane) => {
      remintDuringReadiness(pane)

      const result = await start()

      expect(result).toMatchObject({
        state: 'failed',
        failedStage: 'agent_readiness',
        lastError: 'terminal_handle_stale'
      })
      expect(h.runtime.waitForTerminal).toHaveBeenCalledTimes(1)
      expect(h.db.getWorkerTerminalResourceByOwner(result.dispatchId)?.terminal_handle).toBe(
        'term_worker'
      )
    })

    it('moves a custody row only for its own Dispatch, old handle and process', async () => {
      h.setup()
      const { dispatchId } = await h.startWorker({ agent: 'codex' })
      const rebind = (
        params: Partial<Parameters<typeof h.db.rebindWorkerTerminalResourceHandle>[0]>
      ) =>
        h.db.rebindWorkerTerminalResourceHandle({
          dispatchId,
          fromHandle: 'term_worker',
          toHandle: 'term_reminted',
          processIncarnation: WORKER_INCARNATION,
          ...params
        })

      expect(rebind({ dispatchId: 'ctx_other' })).toBe(false)
      expect(rebind({ fromHandle: 'term_other' })).toBe(false)
      expect(rebind({ processIncarnation: 'runtime_test:term_worker:2' })).toBe(false)
      expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.terminal_handle).toBe('term_worker')
      expect(rebind({})).toBe(true)
      expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.terminal_handle).toBe(
        'term_reminted'
      )
    })

    it('fails when the new handle goes stale too, without a third wait', async () => {
      remintDuringReadiness({ handle: 'term_reminted', incarnation: WORKER_INCARNATION })
      vi.mocked(h.runtime.waitForTerminal)
        .mockReset()
        .mockRejectedValue(new Error('terminal_handle_stale'))

      const result = await start()

      expect(result).toMatchObject({
        state: 'failed',
        failedStage: 'agent_readiness',
        lastError: 'terminal_handle_stale'
      })
      expect(h.runtime.waitForTerminal).toHaveBeenCalledTimes(2)
    })
  })

  describe('composer-marker first dispatch readiness', () => {
    const h = createOrchestrationWorkerReleaseHarness()
    afterEach(() => h.cleanup())

    it.each(['zcode', 'opencode', 'opencode2'] as const)(
      '%s waits for the new composer before dispatch',
      async (agent) => {
        h.setup()
        const gate = h.deferred<RuntimeTerminalWait>()
        vi.spyOn(h.runtime, 'waitForFreshWorkerComposer').mockReturnValue(gate.promise)
        const pending = h.startWorker({ agent })
        await vi.waitFor(() =>
          expect(h.runtime.waitForFreshWorkerComposer).toHaveBeenCalledWith(
            'term_worker',
            agent,
            60_000
          )
        )
        expect(h.runtime.waitForTerminal).not.toHaveBeenCalled()
        expect(h.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
        gate.resolve({
          handle: 'term_worker',
          condition: 'tui-idle',
          satisfied: true,
          status: 'running',
          exitCode: null
        })
        await pending
        expect(h.runtime.sendTerminalAgentPrompt).toHaveBeenCalledOnce()
      }
    )

    it('keeps reused terminals on the normal idle wait', async () => {
      h.setup()
      vi.spyOn(h.runtime, 'waitForFreshWorkerComposer')
      await h.startWorker({ terminal: 'term_worker' })
      expect(h.runtime.waitForFreshWorkerComposer).not.toHaveBeenCalled()
      expect(h.runtime.waitForTerminal).toHaveBeenCalledWith(
        'term_worker',
        expect.objectContaining({ condition: 'tui-idle' })
      )
    })

    it('never delivers a task after a startup timeout', async () => {
      h.setup()
      vi.spyOn(h.runtime, 'waitForFreshWorkerComposer').mockRejectedValue(new Error('timeout'))
      await expect(h.startWorker({ agent: 'zcode' })).rejects.toThrow('Expected worker-start')
      expect(h.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
    })
  })
}
