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

  // Why the head and not the branch name: a branch that moves after the proof must not be deleted.
  const isAncestorOfMain = ['merge-base', '--is-ancestor', 'def456', 'refs/heads/main']
  const deleteAtHead = ['update-ref', '-d', 'refs/heads/feature/test', 'def456']
  const listWorktrees = ['worktree', 'list', '--porcelain']
  const mockLocalMainDefault = () =>
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: 'refs/heads/main\0\n' })

  // Pin a non-Windows host to keep exact argv independent of core.longpaths.
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

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({
      preservedBranch: {
        branchName: 'feature/test',
        head: 'def456',
        reason: 'not_merged_into_default'
      }
    })

    const calls = gitExecFileAsyncMock.mock.calls.map((call) => call[0])
    expect(calls).toContainEqual(isAncestorOfMain)
    expect(calls).not.toContainEqual(deleteAtHead)
    expect(calls).not.toContainEqual(['branch', '-D', '--', 'feature/test'])
  })

  it('preserves a contained branch when its head moved before the delete', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree list: not checked out
    gitExecFileAsyncMock.mockRejectedValueOnce(new Error('cannot lock ref')) // update-ref -d
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' }) // squash proof finds no target tree

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({
      preservedBranch: { branchName: 'feature/test', head: 'def456', reason: 'delete_failed' }
    })
    const calls = gitExecFileAsyncMock.mock.calls.map((call) => call[0])
    expect(calls).toContainEqual(deleteAtHead)
    expect(calls).not.toContainEqual(['branch', '-d', '--', 'feature/test'])
    expect(calls).not.toContainEqual(['branch', '-D', '--', 'feature/test'])
  })

  it('deletes the branch at its removed head once local main contains it', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' }) // proof, delete and its checks succeed

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({})

    expect(gitExecFileAsyncMock.mock.calls.map((call) => call[0])).toEqual([
      ['worktree', 'list', '--porcelain', '-z'],
      ['worktree', 'remove', '/repo-feature'],
      DEFAULT_BRANCH_PROBE_ARGS,
      isAncestorOfMain,
      listWorktrees,
      deleteAtHead,
      listWorktrees,
      ['config', '--remove-section', 'branch.feature/test']
    ])
  })

  it('reuses known removed worktree metadata instead of relisting before removal', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' }) // proof, delete and its checks succeed

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
      listWorktrees,
      deleteAtHead,
      listWorktrees,
      ['config', '--remove-section', 'branch.feature/test']
    ])
  })

  it('prunes and retries branch deletion only when a worktree record holds the branch', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: beforeRemoval }) // list before
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // worktree remove
    mockLocalMainDefault()
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' }) // merge-base --is-ancestor
    gitExecFileAsyncMock.mockResolvedValueOnce({
      stdout:
        'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-stale\nHEAD def456\nbranch refs/heads/feature/test\nprunable gitdir file points to non-existent location\n'
    }) // a stale record still holds the branch
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' }) // prune, then the retry succeeds

    await expect(removeWorktree('/repo', '/repo-feature', false)).resolves.toEqual({})

    expect(gitExecFileAsyncMock.mock.calls.map((call) => call[0])).toEqual([
      ['worktree', 'list', '--porcelain', '-z'],
      ['worktree', 'remove', '/repo-feature'],
      DEFAULT_BRANCH_PROBE_ARGS,
      isAncestorOfMain,
      listWorktrees,
      ['worktree', 'prune'],
      listWorktrees,
      deleteAtHead,
      listWorktrees,
      ['config', '--remove-section', 'branch.feature/test']
    ])
  })
})
