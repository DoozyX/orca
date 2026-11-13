import { describe, expect, it, vi } from 'vitest'
import { resolveLocalDefaultBranchRef, type GitBranchCleanupExec } from './git-branch-cleanup'

describe('resolveLocalDefaultBranchRef', () => {
  function forEachRefAnswering(stdout: string): GitBranchCleanupExec {
    return vi.fn<GitBranchCleanupExec>(async (args) => ({
      stdout: args[0] === 'for-each-ref' ? stdout : ''
    }))
  }

  it('names the local branch behind the remote-tracking default', async () => {
    await expect(
      resolveLocalDefaultBranchRef(
        forEachRefAnswering('refs/remotes/origin/HEAD\0refs/remotes/origin/release/stable\n')
      )
    ).resolves.toBe('refs/heads/release/stable')
  })

  it('names a local default when the repository has no remote', async () => {
    await expect(
      resolveLocalDefaultBranchRef(forEachRefAnswering('refs/heads/master\0\n'))
    ).resolves.toBe('refs/heads/master')
  })

  it('answers null when no default branch resolves', async () => {
    await expect(resolveLocalDefaultBranchRef(forEachRefAnswering(''))).resolves.toBeNull()
  })
})
