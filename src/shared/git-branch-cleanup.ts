import type { GitCapabilityCache } from './git-capability-cache'
import { resolveDefaultBaseRefViaExec } from './git-default-base-ref'
import { isUnsupportedMergeTreeWriteTreeError } from './git-merge-tree-capability'
export { refreshBranchCleanupTargetRefs } from './git-branch-cleanup-fetch'

export type GitBranchCleanupExecOptions = {
  stdin?: string
  /** The command's object writes are throwaway; run it against a scratch object store. */
  discardWrittenObjects?: boolean
}

export type GitBranchCleanupExec = (
  argv: string[],
  options?: GitBranchCleanupExecOptions
) => Promise<{ stdout: string }>

const SQUASH_PATCH_SCAN_LIMIT = 200

async function readOptionalGitStdout(
  runGit: GitBranchCleanupExec,
  argv: string[],
  options?: { stdin?: string }
): Promise<string | null> {
  try {
    const { stdout } = await runGit(argv, options)
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function readOptionalGitRawStdout(
  runGit: GitBranchCleanupExec,
  argv: string[]
): Promise<string | null> {
  try {
    const { stdout } = await runGit(argv)
    return stdout || null
  } catch {
    return null
  }
}

/**
 * `refs/heads/<default>` on the host `runGit` executes on: the one ref whose containment proves a
 * branch merged (#15). An upstream, a saved base, `origin/HEAD` or the primary checkout's HEAD do not.
 */
export async function resolveLocalDefaultBranchRef(
  runGit: GitBranchCleanupExec
): Promise<string | null> {
  const baseRef = await resolveDefaultBaseRefViaExec((argv) => runGit(argv))
  // Same base-ref → branch-name normalization as getRepoDefaultBranchName.
  return baseRef ? `refs/heads/${baseRef.replace(/^origin\//, '')}` : null
}

async function resolveCommitOid(runGit: GitBranchCleanupExec, ref: string): Promise<string | null> {
  return readOptionalGitStdout(runGit, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
}

async function hasBranchOnlyMergeCommits(
  runGit: GitBranchCleanupExec,
  targetOid: string,
  branchRef: string
): Promise<boolean> {
  const stdout = await readOptionalGitStdout(runGit, [
    'rev-list',
    '--right-only',
    '--merges',
    '--count',
    `${targetOid}...${branchRef}`
  ])
  return Number(stdout ?? 0) > 0
}

/** `merge-tree --write-tree` exits 1 on a conflict after printing the merged tree's ID first. */
function printedMergedTreeId(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) {
    return false
  }
  const firstLine = typeof error.stdout === 'string' ? error.stdout.split('\n', 1)[0].trim() : ''
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(firstLine)
}

async function branchMergesWithoutTreeChanges(
  runGit: GitBranchCleanupExec,
  targetOid: string,
  branchRef: string,
  capabilities: GitCapabilityCache
): Promise<boolean> {
  const args = ['merge-tree', '--write-tree', targetOid, branchRef]
  const readMergedTree = async (): Promise<string | null> => {
    try {
      return await capabilities.runWithFallback(
        'merge-tree-write-tree',
        async () => {
          // Why only once supported: an old Git still gets the folder, and Git < 2.35 can't prune a leftover.
          const discardWrittenObjects = capabilities.isKnownSupported('merge-tree-write-tree')
          try {
            return (await runGit(args, { discardWrittenObjects })).stdout.trim() || null
          } catch (error) {
            // Why: a conflict still proves --write-tree ran; returning lets the cache record it.
            if (printedMergedTreeId(error)) {
              return null
            }
            throw error
          }
        },
        async () => null,
        isUnsupportedMergeTreeWriteTreeError
      )
    } catch {
      return null
    }
  }
  const mergedTree = await readMergedTree()
  if (!mergedTree) {
    return false
  }
  const targetTree = await readOptionalGitStdout(runGit, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${targetOid}^{tree}`
  ])
  return Boolean(mergedTree && targetTree && mergedTree.split(/\r?\n/)[0] === targetTree)
}

async function branchOnlyCommitsArePatchEquivalent(
  runGit: GitBranchCleanupExec,
  targetOid: string,
  branchRef: string
): Promise<boolean> {
  const stdout = await readOptionalGitStdout(runGit, ['cherry', '-v', targetOid, branchRef])
  if (stdout === null) {
    return false
  }
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.every((line) => line.startsWith('-'))
}

function parsePatchId(stdout: string | null): string | null {
  const line = stdout
    ?.split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(Boolean)
  const patchId = line?.split(/\s+/)[0]
  return patchId || null
}

async function computeStablePatchId(
  runGit: GitBranchCleanupExec,
  patchText: string | null
): Promise<string | null> {
  if (!patchText) {
    return null
  }
  return parsePatchId(
    await readOptionalGitStdout(runGit, ['patch-id', '--stable'], { stdin: patchText })
  )
}

async function branchNetPatchMatchesTargetSquashCommit(
  runGit: GitBranchCleanupExec,
  targetOid: string,
  branchRef: string,
  mergeBase: string,
  capabilities: GitCapabilityCache
): Promise<boolean> {
  const branchPatchId = await computeStablePatchId(
    runGit,
    await readOptionalGitRawStdout(runGit, ['diff', mergeBase, branchRef])
  )
  if (!branchPatchId) {
    return false
  }

  const commits = (
    await readOptionalGitStdout(runGit, [
      'rev-list',
      '--ancestry-path',
      `--max-count=${SQUASH_PATCH_SCAN_LIMIT + 1}`,
      `${mergeBase}..${targetOid}`
    ])
  )
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!commits?.length || commits.length > SQUASH_PATCH_SCAN_LIMIT) {
    return false
  }

  for (const commitOid of commits) {
    const commitPatchId = await computeStablePatchId(
      runGit,
      await readOptionalGitRawStdout(runGit, ['show', '--format=', commitOid])
    )
    // Why: a matching patch-id identifies a possible squash commit, but the
    // tree merge proves the branch contributes no additional changes there.
    if (
      commitPatchId === branchPatchId &&
      (await branchMergesWithoutTreeChanges(runGit, commitOid, branchRef, capabilities))
    ) {
      return true
    }
  }
  return false
}

export async function branchHasNoUnmergedChangesOnAnyTarget(
  runGit: GitBranchCleanupExec,
  branchName: string,
  targetRefs: string[],
  capabilities: GitCapabilityCache
): Promise<boolean> {
  const branchRef = `refs/heads/${branchName}`

  for (const targetRef of targetRefs) {
    const targetOid = await resolveCommitOid(runGit, targetRef)
    if (!targetOid) {
      continue
    }
    // Shallow/unrelated histories cannot support a merge proof; avoid the expensive tree walk.
    const mergeBase = await readOptionalGitStdout(runGit, ['merge-base', targetOid, branchRef])
    if (!mergeBase) {
      continue
    }
    if (await branchMergesWithoutTreeChanges(runGit, targetOid, branchRef, capabilities)) {
      return true
    }
    if (await hasBranchOnlyMergeCommits(runGit, targetOid, branchRef)) {
      if (
        await branchNetPatchMatchesTargetSquashCommit(
          runGit,
          targetOid,
          branchRef,
          mergeBase,
          capabilities
        )
      ) {
        return true
      }
      continue
    }
    if (await branchOnlyCommitsArePatchEquivalent(runGit, targetOid, branchRef)) {
      return true
    }
  }

  return false
}
