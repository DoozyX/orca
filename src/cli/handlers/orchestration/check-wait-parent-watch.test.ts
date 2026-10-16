import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_WAIT_PARENT_POLL_MS, startCheckWaitParentWatch } from './check-wait-parent-watch'

function parentPids(...pids: number[]): () => number {
  let index = 0
  return () => pids[Math.min(index++, pids.length - 1)]
}

describe('check --wait parent watch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once after the parent pid changes to init', () => {
    const onOrphaned = vi.fn()
    startCheckWaitParentWatch({
      onOrphaned,
      readParentPid: parentPids(4242, 4242, 1),
      platform: 'darwin'
    })

    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS)
    expect(onOrphaned).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS)
    expect(onOrphaned).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS * 5)
    expect(onOrphaned).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fires when a subreaper adopts the orphan', () => {
    const onOrphaned = vi.fn()
    startCheckWaitParentWatch({
      onOrphaned,
      readParentPid: parentPids(4242, 777),
      platform: 'linux'
    })

    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS)
    expect(onOrphaned).toHaveBeenCalledTimes(1)
  })

  it('never fires after it is stopped', () => {
    const onOrphaned = vi.fn()
    const stop = startCheckWaitParentWatch({
      onOrphaned,
      readParentPid: parentPids(4242, 1),
      platform: 'linux'
    })

    stop()
    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS * 3)
    expect(onOrphaned).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts nothing on Windows, where an orphan is never reparented', () => {
    const onOrphaned = vi.fn()
    const readParentPid = vi.fn(parentPids(4242, 1))
    startCheckWaitParentWatch({ onOrphaned, readParentPid, platform: 'win32' })

    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS * 3)
    expect(onOrphaned).not.toHaveBeenCalled()
    expect(readParentPid).not.toHaveBeenCalled()
  })
})
