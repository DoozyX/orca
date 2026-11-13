import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  hostClaudeAccountIds,
  resolveClaudeAccountAssignmentForGroup,
  type ClaudeAccountAssignment
} from '../../../../../../shared/claude-account-assignment'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import {
  LOCAL_EXECUTION_HOST_ID,
  getProjectGroupExecutionHostId
} from '../../../../../../shared/execution-host'

export type ProjectGroupSettingsTarget = {
  groupId: string
  groupName: string
  claudeAccountId: string | null
  /** What the group runs under when it assigns nothing itself. */
  inherited: ClaudeAccountAssignment | null
}

/** Group settings hold only the Claude account, which exists for groups on this computer. */
export function useProjectGroupSettingsDialog(
  projectGroups: readonly ProjectGroup[],
  updateProjectGroup: AppState['updateProjectGroup']
) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const savedAccounts = useAppStore((s) => s.settings?.claudeManagedAccounts)

  // Derived live so a rename or a parent's assignment changed elsewhere shows while it is open.
  const settingsTarget = useMemo<ProjectGroupSettingsTarget | null>(() => {
    const group = projectGroups.find(
      (candidate) =>
        candidate.id === groupId &&
        getProjectGroupExecutionHostId(candidate) === LOCAL_EXECUTION_HOST_ID
    )
    if (!group) {
      return null
    }
    return {
      groupId: group.id,
      groupName: group.name,
      claudeAccountId: group.claudeAccountId ?? null,
      inherited: resolveClaudeAccountAssignmentForGroup(
        projectGroups,
        group.parentGroupId,
        hostClaudeAccountIds(savedAccounts ?? [])
      )
    }
  }, [projectGroups, groupId, savedAccounts])

  const handleSubmitProjectGroupSettings = useCallback(
    async (claudeAccountId: string | null): Promise<boolean> => {
      if (!groupId) {
        return false
      }
      const saved = await updateProjectGroup(
        groupId,
        { claudeAccountId },
        { hostId: LOCAL_EXECUTION_HOST_ID }
      )
      if (!saved) {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeList.groupSettingsSaveFailed',
            'Failed to save group settings'
          )
        )
      }
      return saved
    },
    [groupId, updateProjectGroup]
  )

  return {
    settingsTarget,
    closeProjectGroupSettings: useCallback(() => setGroupId(null), []),
    handleOpenProjectGroupSettings: setGroupId,
    handleSubmitProjectGroupSettings
  }
}
