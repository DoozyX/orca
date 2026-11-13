import {
  branchHasNoUnmergedChangesOnAnyTarget,
  type GitBranchCleanupExecOptions
} from '../../../../shared/git/branches/git-branch-cleanup'
import { withLocalGitCapabilityCacheForExecution } from '../../command-runner/host-routing/git-capability-state'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'
import { offlineGitEnv } from '../../command-runner/git-environment/git-process-env'
import { routeLocalGitOptions } from '../../command-runner/host-routing/local-git-runtime-route'
import { createLocalGitObjectQuarantine } from '../../objects/local-git-object-quarantine'
import {
  gitExecOptions,
  type GitWorktreeExecOptions
} from '../../worktrees/worktree-operation-options'

/** Git's proof that a local branch adds no changes to a target, squash and rebase merges included. */
export async function localBranchHasNoUnmergedChanges(args: {
  cwd: string
  branchName: string
  targetRefs: string[]
  options?: GitWorktreeExecOptions
}): Promise<boolean> {
  const { cwd, branchName, targetRefs } = args
  // Settle the project's WSL route first so quarantine and capability caches match the Git that runs.
  const options = routeLocalGitOptions({ ...args.options, cwd })
  const quarantine = createLocalGitObjectQuarantine(cwd, options)
  const runGit = (argv: string[], execOptions?: GitBranchCleanupExecOptions) => {
    // Offline, partial-clone blob fetches included: the fork proves merges against local refs only (#15).
    const run = (quarantineEnv: NodeJS.ProcessEnv | undefined) =>
      gitExecFileAsync(argv, {
        ...gitExecOptions(cwd, options),
        ...(execOptions?.stdin !== undefined ? { stdin: execOptions.stdin } : {}),
        env: offlineGitEnv(quarantineEnv)
      })
    return execOptions?.discardWrittenObjects ? quarantine.run(run) : run(undefined)
  }
  return withLocalGitCapabilityCacheForExecution(
    { cwd, wslDistro: options.wslDistro, signal: options.signal },
    (capabilities) =>
      branchHasNoUnmergedChangesOnAnyTarget(runGit, branchName, targetRefs, capabilities)
  )
}
