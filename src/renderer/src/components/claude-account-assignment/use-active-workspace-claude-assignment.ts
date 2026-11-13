import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  hostClaudeAccountIds,
  resolveClaudeAccountAssignmentForWorkspace,
  type ClaudeAccountAssignment
} from '../../../../shared/claude-account-assignment'

/** The Orca Claude account the focused workspace's group or project pins; null follows global. */
export function useActiveWorkspaceClaudeAssignment(): ClaudeAccountAssignment | null {
  const workspaceId = useAppStore((s) => s.activeWorkspaceKey ?? s.activeWorktreeId)
  const executionHostId = useAppStore((s) => s.activeWorkspaceExecutionHostId)
  const repos = useAppStore((s) => s.repos)
  const folderWorkspaces = useAppStore((s) => s.folderWorkspaces)
  const groups = useAppStore((s) => s.projectGroups)
  const savedAccounts = useAppStore((s) => s.settings?.claudeManagedAccounts)
  return useMemo(() => {
    if (!workspaceId) {
      return null
    }
    return resolveClaudeAccountAssignmentForWorkspace({
      workspaceId,
      executionHostId,
      repos,
      folderWorkspaces,
      groups,
      knownAccountIds: hostClaudeAccountIds(savedAccounts ?? [])
    })
  }, [workspaceId, executionHostId, repos, folderWorkspaces, groups, savedAccounts])
}
