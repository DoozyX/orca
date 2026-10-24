import { describe, expect, it, vi } from 'vitest'
import {
  branchHasNoUnmergedChangesOnAnyTarget,
  resolveLocalDefaultBranchRef,
  type GitBranchCleanupExec
} from './git-branch-cleanup'
import { GitCapabilityCache } from './git-capability-cache'

function baseProofResponses(
  responses: Partial<Record<string, string | Error>> = {}
): GitBranchCleanupExec {
  return vi.fn<GitBranchCleanupExec>(async (args, options) => {
    if (args[0] === 'patch-id' && options?.stdin === 'branch-diff') {
      const response = responses.branchPatchId ?? 'branch-patch 0000000\n'
      if (response instanceof Error) {
        throw response
      }
      return { stdout: response }
    }
    if (args[0] === 'patch-id' && options?.stdin === 'squash-diff') {
      const response = responses.squashPatchId ?? 'branch-patch squash\n'
      if (response instanceof Error) {
        throw response
      }
      return { stdout: response }
    }
    const key = args.join(' ')
    const response =
      responses[key] ??
      {
        'rev-parse --verify --quiet refs/remotes/origin/main^{commit}': 'target\n',
        'merge-tree --write-tree target refs/heads/feature/test': 'merged-tree\n',
        'rev-parse --verify --quiet target^{tree}': 'target-tree\n',
        'rev-list --right-only --merges --count target...refs/heads/feature/test': '1\n',
        'merge-base target refs/heads/feature/test': 'base\n',
        'diff base refs/heads/feature/test': 'branch-diff',
        'rev-list --ancestry-path --max-count=201 base..target': 'squash\n',
        'show --format= squash': 'squash-diff',
        'merge-tree --write-tree squash refs/heads/feature/test': 'squash-tree\n',
        'rev-parse --verify --quiet squash^{tree}': 'squash-tree\n'
      }[key] ??
      ''
    if (response instanceof Error) {
      throw response
    }
    return { stdout: response }
  })
}

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

describe('branchHasNoUnmergedChangesOnAnyTarget', () => {
  it('preserves a branch without simulating a merge when no common ancestor is available', async () => {
    const runGit = baseProofResponses({
      'merge-base target refs/heads/feature/test': new Error('no common ancestor')
    })

    await expect(
      branchHasNoUnmergedChangesOnAnyTarget(
        runGit,
        'feature/test',
        ['refs/remotes/origin/main'],
        new GitCapabilityCache()
      )
    ).resolves.toBe(false)

    expect(vi.mocked(runGit).mock.calls.some(([args]) => args[0] === 'merge-tree')).toBe(false)
    expect(vi.mocked(runGit).mock.calls.some(([args]) => args[0] === 'cherry')).toBe(false)
  })

  it('accepts a branch with merge commits when a target squash commit matches its net patch', async () => {
    const runGit = baseProofResponses()

    await expect(
      branchHasNoUnmergedChangesOnAnyTarget(
        runGit,
        'feature/test',
        ['refs/remotes/origin/main'],
        new GitCapabilityCache()
      )
    ).resolves.toBe(true)

    expect(runGit).toHaveBeenCalledWith(['patch-id', '--stable'], { stdin: 'branch-diff' })
    expect(runGit).toHaveBeenCalledWith(['patch-id', '--stable'], { stdin: 'squash-diff' })
    expect(runGit).not.toHaveBeenCalledWith(['cherry', '-v', 'target', 'refs/heads/feature/test'])
    // Only merge-tree's throwaway tree writes go to a scratch object store.
    const discarding = vi
      .mocked(runGit)
      .mock.calls.filter(([, options]) => options?.discardWrittenObjects)
      .map(([args]) => args[0])
    expect(discarding.length).toBeGreaterThan(0)
    expect(new Set(discarding)).toEqual(new Set(['merge-tree']))
  })

  describe('a merge-tree that exits 1', () => {
    function exitOne(stdout: string): Error {
      return Object.assign(new Error('Command failed: git merge-tree --write-tree'), {
        code: 1,
        stdout,
        stderr: ''
      })
    }

    async function scratchStoreRequestsOverTwoChecks(failure: Error): Promise<unknown[]> {
      // No branch-only merge commits, so each check runs merge-tree exactly once.
      const runGit = baseProofResponses({
        'merge-tree --write-tree target refs/heads/feature/test': failure,
        'rev-list --right-only --merges --count target...refs/heads/feature/test': '0\n'
      })
      const capabilities = new GitCapabilityCache()
      const check = () =>
        branchHasNoUnmergedChangesOnAnyTarget(
          runGit,
          'feature/test',
          ['refs/remotes/origin/main'],
          capabilities
        )

      await expect(check()).resolves.toBe(false)
      await expect(check()).resolves.toBe(false)

      return vi
        .mocked(runGit)
        .mock.calls.filter(([args]) => args[0] === 'merge-tree')
        .map(([, options]) => options?.discardWrittenObjects)
    }

    it.each([
      ['SHA-1', 'a'.repeat(40)],
      ['SHA-256', 'b'.repeat(64)]
    ])(
      'learns support from a conflict (%s tree ID), so the next check asks for a scratch store',
      async (_label, treeId) => {
        const conflict = exitOne(`${treeId}\n100644 ${'c'.repeat(40)} 1\tshared.txt\n\n`)

        await expect(scratchStoreRequestsOverTwoChecks(conflict)).resolves.toEqual([false, true])
      }
    )

    it.each([
      ['empty stdout', ''],
      ['stdout that is not a tree ID', 'merged-tree\n']
    ])('does not record support from %s', async (_label, stdout) => {
      await expect(scratchStoreRequestsOverTwoChecks(exitOne(stdout))).resolves.toEqual([
        false,
        false
      ])
    })
  })

  it('preserves a branch with merge commits when no target squash commit matches', async () => {
    const runGit = baseProofResponses({ squashPatchId: 'other-patch squash\n' })

    await expect(
      branchHasNoUnmergedChangesOnAnyTarget(
        runGit,
        'feature/test',
        ['refs/remotes/origin/main'],
        new GitCapabilityCache()
      )
    ).resolves.toBe(false)
  })

  it('preserves when a matching squash candidate still changes after merging the branch', async () => {
    const runGit = baseProofResponses({
      'merge-tree --write-tree squash refs/heads/feature/test': 'different-tree\n'
    })

    await expect(
      branchHasNoUnmergedChangesOnAnyTarget(
        runGit,
        'feature/test',
        ['refs/remotes/origin/main'],
        new GitCapabilityCache()
      )
    ).resolves.toBe(false)
  })

  it('preserves when the target squash scan exceeds the cap', async () => {
    const commits = Array.from({ length: 201 }, (_, index) => `commit-${index}`).join('\n')
    const runGit = baseProofResponses({
      'rev-list --ancestry-path --max-count=201 base..target': `${commits}\n`
    })

    await expect(
      branchHasNoUnmergedChangesOnAnyTarget(
        runGit,
        'feature/test',
        ['refs/remotes/origin/main'],
        new GitCapabilityCache()
      )
    ).resolves.toBe(false)

    expect(runGit).not.toHaveBeenCalledWith(['show', '--format=', 'commit-0'])
  })

  it('preserves when patch-id cannot be computed', async () => {
    const runGit = baseProofResponses({ branchPatchId: new Error('patch-id failed') })

    await expect(
      branchHasNoUnmergedChangesOnAnyTarget(
        runGit,
        'feature/test',
        ['refs/remotes/origin/main'],
        new GitCapabilityCache()
      )
    ).resolves.toBe(false)
  })

  it('does not repeat a rejected merge-tree --write-tree proof on old Git', async () => {
    const unsupported = Object.assign(new Error('unknown option'), {
      stderr: 'fatal: unknown rev --write-tree'
    })
    const runGit = baseProofResponses({
      'merge-tree --write-tree target refs/heads/feature/test': unsupported,
      'rev-list --right-only --merges --count target...refs/heads/feature/test': '0\n',
      'cherry -v target refs/heads/feature/test': '+ branch-only commit\n'
    })
    const capabilities = new GitCapabilityCache()

    await branchHasNoUnmergedChangesOnAnyTarget(
      runGit,
      'feature/test',
      ['refs/remotes/origin/main'],
      capabilities
    )
    await branchHasNoUnmergedChangesOnAnyTarget(
      runGit,
      'feature/test',
      ['refs/remotes/origin/main'],
      capabilities
    )

    const mergeTreeCalls = vi.mocked(runGit).mock.calls.filter(([args]) => args[0] === 'merge-tree')
    expect(mergeTreeCalls).toHaveLength(1)
  })
})
