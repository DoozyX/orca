import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../../../../../shared/protocol-version'
import { parseArgs, validateCommandAndFlags } from '../../../../../../cli/args'
import { ORCHESTRATION_WORKER_COMMAND_SPECS } from '../../../../../../cli/specs/orchestration-worker-specs'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { createOrchestrationWorkerReleaseHarness } from './worker-release.test-support'

const SQLITE_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** A fixture this file builds did not hold the shape its test relies on. */
class ReleaseFixtureError extends Error {}

describe('orchestration worker release', () => {
  const h = createOrchestrationWorkerReleaseHarness()

  afterEach(() => h.cleanup())

  it('creates an owned resource for a fresh worker terminal', async () => {
    h.setup()
    const { dispatchId } = await h.startWorker()
    const resource = h.db.getWorkerTerminalResourceByOwner(dispatchId)
    expect(resource).toMatchObject({
      ownership_state: 'owned',
      release_state: 'not_requested',
      terminal_handle: 'term_worker',
      pane_key: h.workerPaneKey,
      process_incarnation: 'runtime_test:term_worker:1'
    })
  })

  it('releases a succeeded worker: archives then closes exactly the agent terminal', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('succeeded')

    const receipt = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
      processAction: string
      archive: { source: string | null; status: string | null } | null
    }

    expect(receipt).toMatchObject({
      state: 'released',
      processAction: 'closed_agent_terminal',
      archive: { source: 'terminal', status: 'captured' }
    })
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
    expect(h.runtime.closeTerminal).toHaveBeenCalledWith('term_worker')
    const resource = h.db.getWorkerTerminalResourceByOwner(dispatchId)
    expect(resource?.release_state).toBe('released')
    expect(resource?.ownership_state).toBe('released')
    // Outcome is untouched by release.
    expect(h.db.getWorkerDispatch(dispatchId)?.state).toBe('succeeded')
  })

  it('does not record recovery bookkeeping for an interactive release', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const resourceId = h.db.getWorkerTerminalResourceByOwner(dispatchId)?.id
    expect(resourceId).toBeDefined()

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'released' })

    expect(h.db.getWorkerTerminalResource(resourceId!)).toMatchObject({
      recovery_attempt_count: 0,
      last_recovery_at: null
    })
  })

  it('releases a failed worker the same way', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('failed')
    const receipt = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
    }
    expect(receipt.state).toBe('released')
    expect(h.db.getWorkerDispatch(dispatchId)?.state).toBe('failed')
  })

  it('is idempotent: a duplicate release returns already_released without another close', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    await h.call('orchestration.workerRelease', { dispatch: dispatchId })
    const second = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
      processAction: string
    }
    expect(second).toMatchObject({ state: 'already_released', processAction: 'none' })
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
  })

  it('rejects an active worker without recording release intent', async () => {
    h.setup()
    const { dispatchId } = await h.startWorker()
    await expect(h.call('orchestration.workerRelease', { dispatch: dispatchId })).rejects.toThrow(
      /only a settled worker can release/
    )
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).toBe('not_requested')
  })

  it('retains an explicitly reused external terminal without closing it', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('succeeded', { terminal: 'term_worker' })
    const receipt = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
      reason?: string
    }
    expect(receipt).toMatchObject({ state: 'retained', reason: 'external_terminal' })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  })

  it('releases a former owner through the Dispatch that now owns its terminal', async () => {
    h.setup()
    const first = await h.startSettledWorker('succeeded')
    const second = await h.startWorker({ terminal: 'term_reminted' })
    h.settle(second.taskId, second.dispatchId, 'succeeded')

    await expect(
      h.call('orchestration.workerRelease', { dispatch: first.dispatchId })
    ).resolves.toMatchObject({
      dispatchId: first.dispatchId,
      state: 'released',
      processAction: 'closed_agent_terminal',
      resolvedDispatchId: second.dispatchId
    })
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
    expect(h.runtime.closeTerminal).toHaveBeenCalledWith('term_reminted')
    await expect(
      h.call('orchestration.workerRelease', { dispatch: second.dispatchId })
    ).resolves.toMatchObject({ state: 'already_released', processAction: 'none' })
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
  })

  it('names the still-active Dispatch that now owns a former owner terminal', async () => {
    h.setup()
    const first = await h.startSettledWorker('succeeded')
    const second = await h.startWorker({ terminal: 'term_reminted' })

    await expect(
      h.call('orchestration.workerRelease', { dispatch: first.dispatchId })
    ).resolves.toMatchObject({
      state: 'retained',
      reason: 'ownership_transferred',
      processAction: 'none',
      currentOwnerDispatchId: second.dispatchId,
      recovery: expect.stringContaining(`worker-release --dispatch ${second.dispatchId}`)
    })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  })

  it('does not follow terminal ownership into another Run', async () => {
    h.setup()
    const first = await h.startSettledWorker('succeeded')
    const second = await h.startWorker({ terminal: 'term_reminted' })
    h.settle(second.taskId, second.dispatchId, 'succeeded')
    const otherRun = h.db.createRun({
      objective: 'Other Run',
      coordinatorHandle: 'term_other_coord',
      coordinatorPaneKey: 'tab_other:aaaaaaaa-aaaa-4aaa-8aaa-00000000000f'
    }).id
    h.db.db
      .prepare('UPDATE dispatch_contexts SET run_id = ? WHERE id = ?')
      .run(otherRun, second.dispatchId)
    h.db.db.prepare('UPDATE tasks SET run_id = ? WHERE id = ?').run(otherRun, second.taskId)

    await expect(
      h.call('orchestration.workerRelease', { dispatch: first.dispatchId })
    ).resolves.toMatchObject({
      state: 'retained',
      reason: 'ownership_transferred',
      currentOwnerDispatchId: second.dispatchId,
      recovery: expect.stringContaining(`--dispatch ${second.dispatchId} --run ${otherRun}`)
    })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(second.dispatchId)?.release_state).toBe(
      'not_requested'
    )
  })

  it.each([
    ['settled', true, ''],
    ['still running', false, ' once it settles (it is ready)']
  ])(
    'points a former owner to the other Orca whose %s remote worker now holds its terminal',
    async (_case, settled, pending) => {
      h.setup()
      const first = await h.startSettledWorker('succeeded')
      const owner = attachRemoteOwner(first.dispatchId, settled)

      await expect(
        h.call('orchestration.workerRelease', { dispatch: first.dispatchId })
      ).resolves.toMatchObject({
        state: 'retained',
        reason: 'ownership_transferred',
        processAction: 'none',
        currentOwnerDispatchId: owner,
        recovery: expect.stringContaining(
          `another Orca runs on this host, so this Orca cannot release it; release it from that Orca${pending}: orca orchestration worker-release --dispatch ${owner} --run run_on_other_home --json`
        )
      })
      expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
      expect(h.db.getWorkerTerminalResourceByOwner(owner)?.release_state).toBe('not_requested')
    }
  )

  it("points a user takeover of another Orca's remote worker terminal to that Orca", async () => {
    h.setup()
    const first = await h.startSettledWorker('succeeded')
    const owner = attachRemoteOwner(first.dispatchId, true)
    await h.call('orchestration.workerTerminalUserInput', { paneKey: h.workerPaneKey })

    const receipt = await h.call('orchestration.workerRelease', { dispatch: first.dispatchId })
    const recovery = recoveryOf(receipt)
    const marker = 'inspect it from that Orca: '
    const step = recovery.slice(recovery.indexOf(marker) + marker.length)
    // The step is run as printed, so the real CLI parser has to accept it.
    expect(() =>
      validateCommandAndFlags(
        ORCHESTRATION_WORKER_COMMAND_SPECS,
        parseArgs(step.split(' ').slice(1))
      )
    ).not.toThrow()
    expect(receipt).toMatchObject({
      state: 'retained',
      currentOwnerDispatchId: owner,
      takeover: { source: 'desktop_terminal_input' },
      recovery: expect.stringContaining(
        `another Orca runs on this host (its Run run_on_other_home); ${marker}orca orchestration worker-show --dispatch ${owner} --json`
      )
    })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  })

  function recoveryOf(receipt: unknown): string {
    if (
      typeof receipt !== 'object' ||
      receipt === null ||
      !('recovery' in receipt) ||
      typeof receipt.recovery !== 'string'
    ) {
      throw new ReleaseFixtureError('Expected the release receipt to carry a recovery step')
    }
    return receipt.recovery
  }

  /** A remote worker another Orca starts on this host, reusing the settled local worker's terminal. */
  function attachRemoteOwner(formerOwnerId: string, settled: boolean): string {
    const resource = h.db.getWorkerTerminalResourceByOwner(formerOwnerId)
    if (!resource?.pane_key || !resource.process_incarnation) {
      throw new ReleaseFixtureError('Expected the local worker to own an identified terminal')
    }
    const dispatchId = 'ctx_remote_owner'
    h.db.createRemoteDispatchAttachment({
      runId: 'run_on_other_home',
      dispatchId,
      taskId: 'task_remote_owner',
      homePeerFingerprint: 'other-home',
      protocolVersion: ORCHESTRATION_CONTRACT_VERSION,
      runtimeEpoch: h.runtime.getRuntimeId(),
      mutationReceipt: {
        callerFingerprint: 'other-home',
        requestId: 'request_remote_owner',
        method: 'orchestration.federationAttachStart',
        payloadHash: 'hash_remote_owner'
      }
    })
    h.db.prepareRemoteAttachmentAuthority({
      dispatchId,
      paneKey: resource.pane_key,
      processIncarnation: resource.process_incarnation,
      worktreeId: 'repo::worktree',
      terminalHandle: resource.terminal_handle,
      hostScope: resource.host_scope,
      setupState: 'not_applicable',
      effects: [],
      terminalOwnership: 'external'
    })
    h.db.markRemoteAttachmentReady(dispatchId)
    if (settled) {
      h.db.recordRemoteAttachmentStage({ dispatchId, state: 'succeeded', stage: 'worker_reported' })
    }
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.id).toBe(resource.id)
    return dispatchId
  }

  it('retains a dead external terminal the orchestration never owned', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('succeeded', { terminal: 'term_worker' })
    h.inspectProcessLiveness.mockResolvedValue('exited')

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({
      state: 'retained',
      reason: 'external_terminal',
      processAction: 'none'
    })
    expect(h.inspectProcessLiveness).toHaveBeenCalledWith(
      'runtime_test:term_worker:1',
      JSON.stringify({ kind: 'local', hostId: 'local' })
    )
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
      ownership_state: 'external',
      release_state: 'not_requested'
    })
  })

  it('retains dead inventory evidence when persisted ownership history is invalid', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker('succeeded', { terminal: 'term_worker' })
    const resource = h.db.getWorkerTerminalResourceByOwner(dispatchId)
    const raw = (
      h.db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }
    ).db
    raw
      .prepare('UPDATE worker_terminal_resources SET prior_owner_dispatch_ids = ? WHERE id = ?')
      .run('{invalid', resource?.id)
    h.inspectProcessLiveness.mockResolvedValue('exited')

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'retained', processAction: 'none' })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).not.toBe('released')
  })

  it('retains a user-taken-over terminal durably', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const changed = (await h.call('orchestration.workerTerminalUserInput', {
      paneKey: h.workerPaneKey
    })) as { changed: number }
    expect(changed.changed).toBe(1)
    const receipt = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
      reason?: string
    }
    const takeover = { source: 'desktop_terminal_input', at: expect.stringMatching(SQLITE_UTC) }
    expect(receipt).toMatchObject({ state: 'retained', reason: 'user_takeover', takeover })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.ownership_state).toBe('user_owned')
    await expect(
      h.call('orchestration.workerShow', { dispatch: dispatchId })
    ).resolves.toMatchObject({ terminalResource: { retainedReason: 'user_takeover', takeover } })
  })

  it('records a structured session takeover by its own source', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    vi.spyOn(h.runtime, 'getStructuredWorkerPaneKeyForSession').mockReturnValue(h.workerPaneKey)

    await expect(
      h.call('orchestration.workerTerminalUserInput', { sessionId: 'session_1' })
    ).resolves.toEqual({ changed: 1 })
    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({
      state: 'retained',
      reason: 'user_takeover',
      takeover: { source: 'structured_session_input', at: expect.stringMatching(SQLITE_UTC) }
    })
  })

  it('reports a takeover recorded before its evidence was kept as unrecorded', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    await expect(
      h.call('orchestration.workerShow', { dispatch: dispatchId })
    ).resolves.toMatchObject({ terminalResource: { takeover: null } })
    await h.call('orchestration.workerTerminalUserInput', { paneKey: h.workerPaneKey })
    h.db.db
      .prepare('UPDATE worker_terminal_resources SET takeover_source = NULL, takeover_at = NULL')
      .run()

    const unrecorded = { source: 'unrecorded', at: null }
    await expect(
      h.call('orchestration.workerShow', { dispatch: dispatchId })
    ).resolves.toMatchObject({ terminalResource: { takeover: unrecorded } })
    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'retained', reason: 'user_takeover', takeover: unrecorded })
  })

  it('keeps a dead user-taken-over terminal in the user takeover', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    await h.call('orchestration.workerTerminalUserInput', { paneKey: h.workerPaneKey })
    h.inspectProcessLiveness.mockResolvedValue('exited')

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'retained', reason: 'user_takeover', processAction: 'none' })
    expect(h.inspectProcessLiveness).toHaveBeenCalledWith(
      'runtime_test:term_worker:1',
      JSON.stringify({ kind: 'local', hostId: 'local' })
    )
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
      ownership_state: 'user_owned',
      release_state: 'retained'
    })
  })

  // A stopped/abandoned worker never reaches `release_state = 'requested'`, so no archive can
  // ever exist for it; refusing the release left the owned pane retained forever.
  it.each(['stopped', 'abandoned'] as const)(
    'releases a dead %s worker whose output could never be archived',
    async (state) => {
      h.setup()
      const { dispatchId } = await h.startWorker()
      if (state === 'stopped') {
        h.db.beginWorkerStop(dispatchId, h.runtime.getRuntimeId())
        h.db.settleWorkerStop(dispatchId)
      } else {
        h.db.abandonWorkerDispatch(dispatchId, 'epoch_test')
      }
      h.inspectProcessLiveness.mockResolvedValue('exited')

      await expect(
        h.call('orchestration.workerRelease', { dispatch: dispatchId })
      ).resolves.toMatchObject({
        state: 'released',
        processAction: 'none',
        archive: { status: 'unavailable' }
      })
      expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
      expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
        ownership_state: 'released',
        release_state: 'released',
        archive_status: 'unavailable'
      })
    }
  )

  it.each(['stopped', 'abandoned'] as const)(
    'keeps a dead %s worker retained while its process is still unproven',
    async (state) => {
      h.setup()
      const { dispatchId } = await h.startWorker()
      if (state === 'stopped') {
        h.db.beginWorkerStop(dispatchId, h.runtime.getRuntimeId())
        h.db.settleWorkerStop(dispatchId)
      } else {
        h.db.abandonWorkerDispatch(dispatchId, 'epoch_test')
      }
      h.inspectProcessLiveness.mockResolvedValue('unverifiable')

      await expect(
        h.call('orchestration.workerRelease', { dispatch: dispatchId })
      ).resolves.toMatchObject({
        state: 'retained',
        reason: 'identity_unproven',
        processAction: 'none'
      })
      expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).not.toBe('released')
    }
  )

  it('lets user takeover cancel a release while output capture is pending', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const pendingRead = h.deferred<Awaited<ReturnType<OrcaRuntimeService['readTerminal']>>>()
    vi.mocked(h.runtime.readTerminal).mockReturnValue(pendingRead.promise)

    const release = h.call('orchestration.workerRelease', { dispatch: dispatchId })
    await vi.waitFor(() => expect(h.runtime.readTerminal).toHaveBeenCalledTimes(1))
    const changed = (await h.call('orchestration.workerTerminalUserInput', {
      paneKey: h.workerPaneKey
    })) as { changed: number }
    expect(changed.changed).toBe(1)
    pendingRead.resolve({
      handle: 'term_worker',
      status: 'running',
      tail: ['captured before takeover'],
      truncated: false,
      nextCursor: '1'
    })

    await expect(release).resolves.toMatchObject({ state: 'retained', reason: 'user_takeover' })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalArchive(dispatchId)).toBeUndefined()
  })

  it('lets an explicit retain cancel a release while output capture is pending', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const pendingRead = h.deferred<Awaited<ReturnType<OrcaRuntimeService['readTerminal']>>>()
    vi.mocked(h.runtime.readTerminal).mockReturnValue(pendingRead.promise)

    const release = h.call('orchestration.workerRelease', { dispatch: dispatchId })
    await vi.waitFor(() => expect(h.runtime.readTerminal).toHaveBeenCalledTimes(1))
    await expect(
      h.call('orchestration.workerRetain', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'retained', reason: 'user_requested' })
    pendingRead.resolve({
      handle: 'term_worker',
      status: 'running',
      tail: ['captured before retention'],
      truncated: false,
      nextCursor: '1'
    })

    await expect(release).resolves.toMatchObject({ state: 'retained', reason: 'user_requested' })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalArchive(dispatchId)).toBeUndefined()
  })

  it('does not claim retention succeeded after terminal close was committed', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const pendingClose = h.deferred<Awaited<ReturnType<OrcaRuntimeService['closeTerminal']>>>()
    vi.mocked(h.runtime.closeTerminal).mockReturnValue(pendingClose.promise)

    const release = h.call('orchestration.workerRelease', { dispatch: dispatchId })
    await vi.waitFor(() => expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1))
    await expect(
      h.call('orchestration.workerRetain', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'release_pending' })
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).toBe('releasing')
    pendingClose.resolve({ handle: 'term_worker', tabId: 'tab-worker', ptyKilled: true })

    await expect(release).resolves.toMatchObject({ state: 'released' })
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).toBe('released')
  })

  it('never marks takeover for panes without an owned resource', async () => {
    h.setup()
    const changed = (await h.call('orchestration.workerTerminalUserInput', {
      paneKey: 'tab_other:cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    })) as { changed: number }
    expect(changed.changed).toBe(0)
  })

  it('preserves takeover across a reminted tab key for the same pane leaf', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const changed = (await h.call('orchestration.workerTerminalUserInput', {
      paneKey: 'tab_reminted:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    })) as { changed: number }

    expect(changed.changed).toBe(1)
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.ownership_state).toBe('user_owned')
  })

  it('keeps a resumed settled worker retained in worker-list without re-dispatch or release', async () => {
    h.setup()
    const { dispatchId, taskId } = await h.startSettledWorker()
    const dispatch = h.db.getDispatchContextById(dispatchId)
    const task = h.db.getTask(taskId)
    vi.mocked(h.runtime.createTerminal).mockClear()
    vi.mocked(h.runtime.sendTerminalAgentPrompt).mockClear()
    vi.mocked(h.runtime.getTerminalProcessIncarnation).mockImplementation((handle) =>
      handle === 'term_worker' ? 'runtime_test:term_worker:2' : null
    )

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({
      state: 'retained',
      reason: 'identity_unproven',
      processAction: 'none'
    })
    const listed = (await h.call('orchestration.workerList', { run: h.activeRunId })) as {
      workers: { dispatchId: string; terminalState: string; workerState: string }[]
    }
    expect(listed.workers).toEqual([
      expect.objectContaining({ dispatchId, terminalState: 'retained', workerState: 'succeeded' })
    ])
    expect(h.db.getTask(taskId)).toEqual(task)
    expect(h.db.getDispatchContextById(dispatchId)).toEqual(dispatch)
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).toBe('retained')
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.runtime.createTerminal).not.toHaveBeenCalled()
    expect(h.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })

  it('retains when the terminal host scope changed instead of closing', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    vi.mocked(h.runtime.getOrchestrationDispatchAuthority).mockReturnValue({
      terminalHandle: 'term_worker',
      paneKey: h.workerPaneKey,
      processIncarnation: 'runtime_test:term_worker:1',
      hostScope: { kind: 'ssh', targetId: 'replacement-host' }
    } as never)

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'retained', reason: 'identity_unproven' })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  })

  it('re-proves process identity after archive capture before closing', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const pendingRead = h.deferred<Awaited<ReturnType<OrcaRuntimeService['readTerminal']>>>()
    vi.mocked(h.runtime.readTerminal).mockReturnValue(pendingRead.promise)

    const release = h.call('orchestration.workerRelease', { dispatch: dispatchId })
    await vi.waitFor(() => expect(h.runtime.readTerminal).toHaveBeenCalledTimes(1))
    vi.mocked(h.runtime.getTerminalProcessIncarnation).mockImplementation((handle) =>
      handle === 'term_worker' ? 'runtime_test:term_worker:2' : null
    )
    pendingRead.resolve({
      handle: 'term_worker',
      status: 'running',
      tail: ['output from the old process'],
      truncated: false,
      nextCursor: '1'
    })

    await expect(release).resolves.toMatchObject({
      state: 'retained',
      reason: 'identity_unproven'
    })
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  })

  it('returns release_unknown when the terminal no longer resolves, then completes a retry', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    vi.mocked(h.runtime.showTerminal).mockRejectedValue(new Error('terminal_handle_stale'))
    const receipt = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
      recovery?: string
    }
    expect(receipt.state).toBe('release_unknown')
    expect(receipt.recovery).toContain('worker-show')
    expect(receipt.recovery).toContain('fresh request ID')
    expect(receipt.recovery).not.toContain('same --retry-request')
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()

    vi.mocked(h.runtime.showTerminal).mockImplementation(
      async (handle) => ({ handle, worktreeId: 'repo::worktree', status: 'running' }) as never
    )
    const retry = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
    }
    expect(retry.state).toBe('released')
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
  })

  it('retains the live terminal when output capture fails', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    vi.mocked(h.runtime.readTerminal).mockRejectedValue(new Error('read exploded'))
    await expect(h.call('orchestration.workerRelease', { dispatch: dispatchId })).rejects.toThrow(
      /Output could not be preserved/
    )
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    // Durable intent survives for recovery.
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).toBe('requested')
  })

  it('refuses a release scoped to another Run without any effect', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    const before = h.db.getWorkerTerminalResourceByOwner(dispatchId)
    const mismatch = {
      code: 'dispatch_run_mismatch',
      message: `Dispatch ${dispatchId} belongs to Run ${h.activeRunId}, not run_other.`
    }

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId, run: 'run_other' })
    ).rejects.toMatchObject(mismatch)
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toEqual(before)
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
    expect(h.db.getWorkerTerminalArchive(dispatchId)).toBeUndefined()

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId, run: h.activeRunId })
    ).resolves.toMatchObject({ state: 'released', processAction: 'closed_agent_terminal' })
  })

  it('refuses a federated release scoped to another Run before relaying it', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    h.db.db
      .prepare(
        `INSERT INTO federated_dispatches (dispatch_id, environment_id, environment_name, peer_fingerprint)
         VALUES (?, 'env_1', 'remote', 'peer_1')`
      )
      .run(dispatchId)
    const relay = vi.spyOn(h.runtime, 'callOrchestrationWorkerServer')

    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId, run: 'run_other' })
    ).rejects.toMatchObject({ code: 'dispatch_run_mismatch' })
    expect(relay).not.toHaveBeenCalled()
    await expect(
      h.call('orchestration.workerRelease', { dispatch: dispatchId, run: h.activeRunId })
    ).rejects.toThrow('Remote worker-release requires a durable retry request.')
  })

  it('keeps worker-retain scoped to a Dispatch alone', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    await expect(
      h.call('orchestration.workerRetain', { dispatch: dispatchId, run: h.activeRunId })
    ).rejects.toThrow(/unrecognized/i)
  })

  it('marks release_unknown when the close itself fails', async () => {
    h.setup()
    const { dispatchId } = await h.startSettledWorker()
    vi.mocked(h.runtime.closeTerminal).mockRejectedValue(new Error('close exploded'))
    const receipt = (await h.call('orchestration.workerRelease', { dispatch: dispatchId })) as {
      state: string
      lastError?: string
      recovery?: string
    }
    expect(receipt.state).toBe('release_unknown')
    expect(receipt.recovery).toContain('fresh request ID')
    expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.release_state).toBe('unknown')
  })
})
