// removeWorktree: branch deletion safety after the checkout is removed.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

const { gitExecFileAsyncMock, gitExecFileSyncMock, translateWslOutputPathsMock } = vi.hoisted(
  () => ({
    gitExecFileAsyncMock: vi.fn(),
    gitExecFileSyncMock: vi.fn(),
    translateWslOutputPathsMock: vi.fn((output: string) => output)
  })
)

vi.mock('./runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock,
  gitExecFileSync: gitExecFileSyncMock,
  translateWslOutputPaths: translateWslOutputPathsMock
}))

import { removeWorktree } from './worktree'
import { DEFAULT_BRANCH_PROBE_ARGS } from './remove-worktree-test-harness'
import { registerWorktreeSuiteHooks } from './worktree-test-harness'

registerWorktreeSuiteHooks()

describe('removeWorktree', () => {
  const beforeRemoval =
    'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def456\nbranch refs/heads/feature/test\n'

  const isAncestorOfMain = [
    'merge-base',
    '--is-ancestor',
    'refs/heads/feature/test',
    'refs/heads/main'
  ]
  const mockLocalMainDefault = () =>
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: 'refs/heads/main\0\n' })

  // Why: removal argv carries core.longpaths on Windows; pin a non-Windows default for exact argv.
  let platformSpy: MockInstance<() => NodeJS.Platform>

  beforeEach(() => {
    gitExecFileAsyncMock.mockReset()
    gitExecFileSyncMock.mockReset()
    translateWslOutputPathsMock.mockClear()
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('preserves a branch local main does not contain, never forcing a delete', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockRejectedValueOnce(new Error('not an ancestor')) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' }) // squash proof finds no target tree

    // Should not throw — the unmerged branch is preserved, not force-deleted.
    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({
      preservedBranch: {
        branchName: 'feature/test',
        head: 'def456',
        reason: 'not_merged_into_default'
      }
    })

    const calls = gitExecFileAsyncMock.mock.calls.map((call) => call[0])
    expect(calls).toContainEqual(isAncestorOfMain)
    expect(calls).not.toContainEqual(['branch', '-d', '--', 'feature/test'])
    expect(calls).not.toContainEqual(['branch', '-D', '--', 'feature/test'])
  })

  it('preserves a contained branch when `branch -d` still refuses it', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockRejectedValueOnce(new Error('not fully merged')) // branch -d
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' }) // squash proof finds no target tree

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({
      preservedBranch: { branchName: 'feature/test', head: 'def456', reason: 'delete_failed' }
    })
    expect(gitExecFileAsyncMock.mock.calls.map((call) => call[0])).not.toContainEqual([
      'branch',
      '-D',
      '--',
      'feature/test'
    ])
  })

  it('deletes the branch with `branch -d` once local main contains it', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // branch -d succeeds

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({})

    expect(gitExecFileAsyncMock.mock.calls.map((call) => call[0])).toEqual([
      ['worktree', 'list', '--porcelain', '-z'],
      ['worktree', 'remove', '/repo-feature'],
      DEFAULT_BRANCH_PROBE_ARGS,
      isAncestorOfMain,
      ['branch', '-d', '--', 'feature/test']
    ])
  })

  it('reuses known removed worktree metadata instead of relisting before removal', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // branch -d succeeds

    await removeWorktree('/repo', '/repo-feature', false, {
      knownRemovedWorktree: {
        branch: 'refs/heads/feature/test',
        head: 'def456'
      }
    })

    expect(gitExecFileAsyncMock.mock.calls.map((call) => call[0])).toEqual([
      ['worktree', 'remove', '/repo-feature'],
      DEFAULT_BRANCH_PROBE_ARGS,
      isAncestorOfMain,
      ['branch', '-d', '--', 'feature/test']
    ])
  })

  it('prunes and retries branch deletion only when Git reports a checked-out branch', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockRejectedValueOnce(
      new Error("error: cannot delete branch 'feature/test' used by worktree at '/repo-stale'")
    ) // branch -d hits stale worktree metadata
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree prune
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // branch -d retry succeeds

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({})

    expect(gitExecFileAsyncMock.mock.calls.map((call) => call[0])).toEqual([
      ['worktree', 'list', '--porcelain', '-z'],
      ['worktree', 'remove', '/repo-feature'],
      DEFAULT_BRANCH_PROBE_ARGS,
      isAncestorOfMain,
      ['branch', '-d', '--', 'feature/test'],
      ['worktree', 'prune'],
      ['branch', '-d', '--', 'feature/test']
    ])
  })
})
