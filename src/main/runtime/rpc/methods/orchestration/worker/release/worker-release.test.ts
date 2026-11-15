import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../../../../orca-runtime'
import { createOrchestrationWorkerReleaseHarness } from '../testing/worker-release.test-support'

describe('orchestration worker release', () => {
  const h = createOrchestrationWorkerReleaseHarness()

  afterEach(() => h.cleanup())

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

  it('names the current owner when a reused terminal is released through its old Dispatch', async () => {
    h.setup()
    const first = await h.startSettledWorker('succeeded')
    const second = await h.startWorker({ terminal: 'term_reminted' })

    const oldRelease = await h.call('orchestration.workerRelease', { dispatch: first.dispatchId })
    expect(oldRelease).toMatchObject({
      state: 'retained',
      reason: 'ownership_transferred',
      currentOwnerDispatchId: second.dispatchId,
      terminalReleaseState: 'not_requested'
    })
    expect(oldRelease).toHaveProperty('recovery', expect.stringContaining(second.dispatchId))
    expect(h.runtime.closeTerminal).not.toHaveBeenCalled()

    h.settle(second.taskId, second.dispatchId, 'succeeded')
    await h.call('orchestration.workerRelease', { dispatch: second.dispatchId })

    const oldReleaseAfterClose = await h.call('orchestration.workerRelease', {
      dispatch: first.dispatchId
    })
    expect(oldReleaseAfterClose).toMatchObject({
      state: 'retained',
      reason: 'ownership_transferred',
      currentOwnerDispatchId: second.dispatchId,
      terminalReleaseState: 'released'
    })
    expect(oldReleaseAfterClose).not.toHaveProperty('recovery')
    expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
  })
})
