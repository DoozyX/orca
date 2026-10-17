import {
  branchHasNoUnmergedChangesOnAnyTarget,
  resolveLocalDefaultBranchRef,
  type GitBranchCleanupExec,
  type GitBranchCleanupExecOptions
} from '../../shared/git-branch-cleanup'
import type {
  PreservedWorktreeBranch,
  RemoveWorktreeResult
} from '../../shared/worktree/create-types'
import { withLocalGitCapabilityCacheForExecution } from './git-capability-state'
import { withRepoRefMaintenancePaused } from './local-repo-ref-maintenance'
import { gitExecFileAsync } from './runner'
import { createLocalGitObjectQuarantine } from './local-git-object-quarantine'
import { isBranchReservedByWorktreeOperation } from '../../shared/git-worktree-admin'
import { parseWorktreeList } from '../../shared/git-worktree-porcelain-parser'
import { isBranchCheckedOutInWorktreeError } from '../../shared/git-branch-delete-refusal'
import type { GitWorktreeExecOptions, RemoveWorktreeOptions } from './worktree-operation-options'
import { gitExecOptions, normalizeLocalBranchRef } from './worktree-operation-options'

export async function deleteBranchAfterWorktreeRemoval(
  repoPath: string,
  branchName: string,
  branchHead: string,
  options: RemoveWorktreeOptions
): Promise<RemoveWorktreeResult> {
  // Why: forceBranchDelete opts into `-D` for failed-creation rollback (a fresh branch, no user work).
  if (options.forceBranchDelete === true) {
    try {
      await deleteLocalBranchAfterWorktreeRemoval(repoPath, branchName, options, () =>
        gitExecFileAsync(['branch', '-D', '--', branchName], gitExecOptions(repoPath, options))
      )
      return {}
    } catch (error) {
      return preserveBranch(branchName, branchHead, 'delete_failed', error)
    }
  }
  const runGit = createBranchCleanupGit(repoPath, options)
  // Why (#15): only the host's local default proves a merge; `branch -d` would also trust an
  // upstream or the primary checkout's HEAD.
  const defaultRef = await resolveLocalDefaultBranchRef(runGit)
  if (!defaultRef) {
    return preserveBranch(branchName, branchHead, 'not_merged_into_default')
  }
  let safeDeleteError: unknown
  // Why the captured head: proof and delete name one commit, so a branch moved in between stays.
  if (branchHead && (await isCommitMergedInto(runGit, branchHead, defaultRef))) {
    try {
      await deleteLocalBranchAfterWorktreeRemoval(repoPath, branchName, options, () =>
        forceDeleteLocalBranch(
          repoPath,
          branchName,
          branchHead,
          (args, cwd) => gitExecFileAsync(args, gitExecOptions(cwd, options)),
          options
        )
      )
      return {}
    } catch (error) {
      safeDeleteError = error
    }
  }
  const squashed = await deleteSquashMergedBranch(
    repoPath,
    branchName,
    branchHead,
    defaultRef,
    runGit,
    options
  )
  if (squashed === 'deleted') {
    return {}
  }
  return squashed === 'delete_failed' || safeDeleteError !== undefined
    ? preserveBranch(branchName, branchHead, 'delete_failed', safeDeleteError)
    : preserveBranch(branchName, branchHead, 'not_merged_into_default')
}

/** Deleting a worktree must never silently discard commits, so a branch it cannot prove merged stays. */
function preserveBranch(
  branchName: string,
  branchHead: string,
  reason: NonNullable<PreservedWorktreeBranch['reason']>,
  error?: unknown
): RemoveWorktreeResult {
  console.warn(
    `[git] Preserved local branch "${branchName}" after removing worktree (${reason})`,
    ...(error === undefined ? [] : [error])
  )
  return { preservedBranch: { branchName, ...(branchHead ? { head: branchHead } : {}), reason } }
}

function createBranchCleanupGit(
  repoPath: string,
  options: GitWorktreeExecOptions
): GitBranchCleanupExec {
  const quarantine = createLocalGitObjectQuarantine(repoPath, options)
  return (args: string[], execOptions?: GitBranchCleanupExecOptions) => {
    const run = (env: NodeJS.ProcessEnv | undefined) =>
      gitExecFileAsync(args, {
        ...gitExecOptions(repoPath, options),
        ...(execOptions?.stdin !== undefined ? { stdin: execOptions.stdin } : {}),
        ...(env ? { env } : {})
      })
    return execOptions?.discardWrittenObjects ? quarantine.run(run) : run(undefined)
  }
}

async function isCommitMergedInto(
  runGit: GitBranchCleanupExec,
  commit: string,
  targetRef: string
): Promise<boolean> {
  try {
    await runGit(['merge-base', '--is-ancestor', commit, targetRef])
    return true
  } catch {
    // Exit 1 is "not an ancestor"; any other failure (a missing ref) proves nothing either.
    return false
  }
}

async function deleteLocalBranchAfterWorktreeRemoval(
  repoPath: string,
  branchName: string,
  options: GitWorktreeExecOptions,
  deleteBranch: () => Promise<unknown>
): Promise<'deleted' | 'checked-out'> {
  try {
    await deleteBranch()
    return 'deleted'
  } catch (error) {
    if (!isBlockedByWorktree(error)) {
      throw error
    }
  }

  try {
    // Why: only pay for `worktree prune` when a stale admin record may be blocking `branch -d`.
    await gitExecFileAsync(['worktree', 'prune'], gitExecOptions(repoPath, options))
  } catch (error) {
    console.warn(`[git] Failed to prune worktrees before deleting branch "${branchName}"`, error)
    return 'checked-out'
  }

  try {
    await deleteBranch()
    return 'deleted'
  } catch (error) {
    if (isBlockedByWorktree(error)) {
      return 'checked-out'
    }
    throw error
  }
}

function isBlockedByWorktree(error: unknown): boolean {
  return error instanceof LocalBranchCheckedOutError || isBranchCheckedOutInWorktreeError(error)
}

/** The branch is checked out or reserved by a worktree, so `forceDeleteLocalBranch` left it. */
class LocalBranchCheckedOutError extends Error {
  constructor(branchName: string) {
    super(`Local branch "${branchName}" is checked out in another worktree.`)
    this.name = 'LocalBranchCheckedOutError'
  }
}

async function deleteSquashMergedBranch(
  repoPath: string,
  branchName: string,
  branchHead: string,
  defaultRef: string,
  runGit: GitBranchCleanupExec,
  options: GitWorktreeExecOptions
): Promise<'deleted' | 'unmerged' | 'delete_failed'> {
  if (!branchHead) {
    return 'unmerged'
  }
  // Why: squash merges rewrite commit IDs, so `branch -d` and ancestry miss them; delete only when
  // Git proves no unmerged tree changes against the local default.
  const hasNoUnmergedChanges = await withLocalGitCapabilityCacheForExecution(
    { cwd: repoPath, wslDistro: options.wslDistro, signal: options.signal },
    (capabilities) =>
      branchHasNoUnmergedChangesOnAnyTarget(runGit, branchName, [defaultRef], capabilities)
  )
  if (!hasNoUnmergedChanges) {
    return 'unmerged'
  }
  try {
    await forceDeleteLocalBranch(
      repoPath,
      branchName,
      branchHead,
      (args, cwd) => gitExecFileAsync(args, gitExecOptions(cwd, options)),
      options
    )
    return 'deleted'
  } catch (error) {
    // Why: worktree is already gone; a raced branch cleanup should degrade to preserved-branch recovery, not fail delete.
    console.warn(
      `[git] Failed to delete already-merged local branch "${branchName}" after removing worktree`,
      error
    )
    return 'delete_failed'
  }
}

export async function forceDeleteLocalBranch(
  repoPath: string,
  branchName: string,
  expectedHead: string,
  runGit: (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }> = (
    args,
    cwd
  ) => gitExecFileAsync(args, gitExecOptions(cwd, options)),
  options: GitWorktreeExecOptions = {}
): Promise<void> {
  if (!branchName || branchName.includes('\0')) {
    throw new Error('Invalid branch name')
  }
  if (!expectedHead) {
    throw new Error(
      `Cannot force-delete local branch "${branchName}" without the commit Git preserved.`
    )
  }
  if (await isLocalBranchCheckedOut(repoPath, branchName, runGit, options)) {
    throw new LocalBranchCheckedOutError(branchName)
  }
  // Why: stale toast actions must not delete a branch that moved; `update-ref -d` deletes only if the ref still == expectedHead.
  try {
    // `update-ref -d` needs the packed-refs lock a running idle pack holds while
    // it rewrites; waits it out rather than cancelling the pack.
    await withRepoRefMaintenancePaused('branch-delete', () =>
      runGit(['update-ref', '-d', `refs/heads/${branchName}`, expectedHead], repoPath)
    )
  } catch {
    throw new Error(
      `Local branch "${branchName}" changed after the workspace was deleted. Review it before deleting it.`
    )
  }
  try {
    if (await isLocalBranchCheckedOut(repoPath, branchName, runGit, options)) {
      throw new LocalBranchCheckedOutError(branchName)
    }
  } catch (error) {
    try {
      await runGit(['update-ref', `refs/heads/${branchName}`, expectedHead, ''], repoPath)
    } catch (restoreError) {
      console.warn(
        `[git] Failed to restore local branch "${branchName}" after concurrent checkout`,
        restoreError
      )
    }
    throw error
  }
  try {
    await runGit(['config', '--remove-section', `branch.${branchName}`], repoPath)
  } catch {
    // Best-effort parity with `git branch -D`; stale config is harmless.
  }
}

async function isLocalBranchCheckedOut(
  repoPath: string,
  branchName: string,
  runGit: (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>,
  options: GitWorktreeExecOptions
): Promise<boolean> {
  const { stdout } = await runGit(['worktree', 'list', '--porcelain'], repoPath)
  const worktrees = parseWorktreeList(stdout)
  return (
    worktrees.some((worktree) => normalizeLocalBranchRef(worktree.branch) === branchName) ||
    isBranchReservedByWorktreeOperation(repoPath, branchName, worktrees, options)
  )
}
