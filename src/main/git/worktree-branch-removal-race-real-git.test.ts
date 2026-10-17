// Real-binary race coverage: a branch that moves between the merge proof and the delete.
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runProcess } from '@orca/process-host'
import { removeTree } from '../../shared/windows-transient-lock-removal'
import type * as Runner from './runner'

const gitHook = vi.hoisted(() => {
  const hook: { afterMergeProof: (() => Promise<void>) | null } = { afterMergeProof: null }
  return hook
})

// Pass-through runner that lets a test act between the ancestry proof and what follows it.
vi.mock('./runner', async (importOriginal) => {
  const actual = await importOriginal<typeof Runner>()
  return {
    ...actual,
    gitExecFileAsync: async (...args: Parameters<typeof actual.gitExecFileAsync>) => {
      const result = await actual.gitExecFileAsync(...args)
      const afterMergeProof = gitHook.afterMergeProof
      if (args[0][0] === 'merge-base' && args[0][1] === '--is-ancestor' && afterMergeProof) {
        gitHook.afterMergeProof = null
        await afterMergeProof()
      }
      return result
    }
  }
})

import { removeWorktree } from './worktree'

let scratchDir = ''
let repoPath = ''
let worktreePath = ''

async function git(args: string[], input?: string): Promise<string> {
  const result = await runProcess({ program: 'git', args, cwd: repoPath, input })
  expect(result.code, result.stderr).toBe(0)
  return result.stdout.trim()
}

beforeEach(async () => {
  scratchDir = await realpath(await mkdtemp(join(tmpdir(), 'orca-branch-removal-race-')))
  repoPath = join(scratchDir, 'repo')
  worktreePath = join(scratchDir, 'feature')
  await mkdir(repoPath, { recursive: true })
  await git(['init', '-q'])
  // Why pinned: `init -b` needs Git 2.28, and branch cleanup measures against the local `main`.
  await git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  await git(['config', 'user.email', 'removal@example.invalid'])
  await git(['config', 'user.name', 'Worktree Removal'])
  await git(['config', 'gc.auto', '0'])
  await writeFile(join(repoPath, 'seed.txt'), 'seed\n')
  await git(['add', 'seed.txt'])
  await git(['commit', '-qm', 'seed'])
  await git(['worktree', 'add', '-q', worktreePath, '-b', 'feature'])
})

afterEach(async () => {
  gitHook.afterMergeProof = null
  await removeTree(scratchDir)
})

describe('branch cleanup racing a branch update', () => {
  it('preserves a branch that advances to an upstream-only commit after the merge proof', async () => {
    const seed = await git(['rev-parse', 'HEAD'])
    // Contained only in the upstream, which `branch -d` trusts but local main does not prove.
    const blob = await git(['hash-object', '-w', '--stdin'], 'upstream only\n')
    const tree = await git(['mktree'], `100644 blob ${blob}\tupstream.txt\n`)
    const upstreamOnly = await git(['commit-tree', tree, '-p', seed, '-m', 'upstream only'])
    await git(['update-ref', 'refs/remotes/origin/feature', upstreamOnly])
    await git(['config', 'remote.origin.url', join(scratchDir, 'origin.git')])
    await git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'])
    await git(['config', 'branch.feature.remote', 'origin'])
    await git(['config', 'branch.feature.merge', 'refs/heads/feature'])
    gitHook.afterMergeProof = async () => {
      await git(['update-ref', 'refs/heads/feature', upstreamOnly])
    }

    const result = await removeWorktree(repoPath, worktreePath)

    expect(gitHook.afterMergeProof).toBeNull()
    expect(await git(['rev-parse', 'refs/heads/feature'])).toBe(upstreamOnly)
    expect(result).toEqual({
      preservedBranch: { branchName: 'feature', head: seed, reason: 'delete_failed' }
    })
  })
})
