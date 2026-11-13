import type { AppState } from '@/store/types'
import {
  hostClaudeAccountIds,
  resolveClaudeAccountAssignmentForWorkspace
} from '../../../../../../shared/claude-account-assignment'

/** Whether a worktree's Claude runs under an account its group or project pins, which a global switch never moves. */
export function claudeAssignedWorktreeMatcher(state: AppState): (worktreeId: string) => boolean {
  const catalog = {
    repos: state.repos,
    folderWorkspaces: state.folderWorkspaces,
    groups: state.projectGroups,
    knownAccountIds: hostClaudeAccountIds(state.settings?.claudeManagedAccounts ?? [])
  }
  const answers = new Map<string, boolean>()
  return (worktreeId) => {
    const known = answers.get(worktreeId)
    if (known !== undefined) {
      return known
    }
    const assigned =
      resolveClaudeAccountAssignmentForWorkspace({ ...catalog, workspaceId: worktreeId }) !== null
    answers.set(worktreeId, assigned)
    return assigned
  }
}
