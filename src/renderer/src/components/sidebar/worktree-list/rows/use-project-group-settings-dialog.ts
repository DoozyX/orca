import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { AppState } from '@/store/types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import {
  getProjectGroupExecutionHostId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host'
import {
  selectInheritedClaudeConfigDir,
  selectProjectGroupForHost,
  type InheritedClaudeConfigDir
} from '../../project-group-claude-config-dir-selection'

/** Only what identifies the row. Everything shown is derived live — see `settingsTarget`. */
export type ProjectGroupSettingsDialogState = {
  groupId: string
  hostId?: ExecutionHostId
}

export type ProjectGroupSettingsTarget = {
  groupName: string
  configDir: string | null
  inherited: InheritedClaudeConfigDir | null
  /** The row's resolved owner host, so the dialog never probes or browses the wrong filesystem. */
  executionHostId: ExecutionHostId
}

function reportUnresolvedProjectGroupHost(): void {
  toast.error(
    translate(
      'auto.components.sidebar.WorktreeList.groupSettingsUnresolvedHost',
      'Cannot open group settings'
    ),
    {
      description: translate(
        'auto.components.sidebar.WorktreeList.groupSettingsUnresolvedHostDesc',
        "Orca could not tell which host owns this group, and a Claude config directory means something different on each one. Reconnect the group's host and try again."
      )
    }
  )
}

export function useProjectGroupSettingsDialog(
  projectGroups: readonly ProjectGroup[],
  updateProjectGroup: AppState['updateProjectGroup']
) {
  const [settingsDialog, setSettingsDialog] = useState<ProjectGroupSettingsDialogState | null>(null)
  const [settingsTargetLost, setSettingsTargetLost] = useState(false)

  // Why live rather than captured at open: the hint names *which* ancestor supplies the binding,
  // and an ancestor edited from another window or arriving on a catalog refresh would otherwise
  // leave the dialog attributing the account to the wrong group. Null means the row no longer
  // resolves on its own host, which is never treated as "local".
  const settingsTarget = useMemo<ProjectGroupSettingsTarget | null>(() => {
    if (!settingsDialog) {
      return null
    }
    const { groupId, hostId } = settingsDialog
    const group = selectProjectGroupForHost(projectGroups, groupId, hostId)
    if (!group) {
      return null
    }
    return {
      groupName: group.name,
      configDir: group.claudeConfigDir ?? null,
      inherited: selectInheritedClaudeConfigDir(projectGroups, groupId, hostId),
      executionHostId: getProjectGroupExecutionHostId(group)
    }
  }, [projectGroups, settingsDialog])

  // Why close rather than wait: losing contact with a host is routine, and leaving the open state
  // behind makes the dialog vanish mid-edit and then re-open by itself when the rows come back.
  // Done during render, so no paint shows a dialog whose row no longer resolves.
  if (settingsDialog && !settingsTarget) {
    setSettingsDialog(null)
    setSettingsTargetLost(true)
  }

  // The notice for a close the user did not ask for; the same refusal the open path reports.
  useEffect(() => {
    if (settingsTargetLost) {
      reportUnresolvedProjectGroupHost()
    }
  }, [settingsTargetLost])

  const handleOpenProjectGroupSettings = useCallback(
    (groupId: string, hostId?: ExecutionHostId) => {
      // Why refuse instead of assuming: a config dir is a filesystem path on exactly one host, so
      // a row whose owner cannot be resolved must not open a dialog that probes, browses and saves
      // against this client. Defaulting an unknown host to `local` is the wrong-host failure.
      if (!selectProjectGroupForHost(projectGroups, groupId, hostId)) {
        reportUnresolvedProjectGroupHost()
        return
      }
      setSettingsTargetLost(false)
      setSettingsDialog({ groupId, hostId })
    },
    [projectGroups]
  )

  const handleSubmitProjectGroupSettings = useCallback(
    async (claudeConfigDir: string | null): Promise<boolean> => {
      if (!settingsDialog) {
        return false
      }
      const saved = await updateProjectGroup(
        settingsDialog.groupId,
        { claudeConfigDir },
        { hostId: settingsDialog.hostId }
      )
      if (!saved) {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeList.groupSettingsSaveFailed',
            'Failed to save group settings'
          ),
          {
            description: translate(
              'auto.components.sidebar.WorktreeList.groupSettingsSaveFailedDesc',
              // Why: a falsy result also covers a refused path and an RPC timeout, so the copy must not assert which.
              "Orca could not confirm the Claude config directory with the group's host. Check that the path is absolute and recheck the group after reconnecting."
            )
          }
        )
      }
      return saved
    },
    [settingsDialog, updateProjectGroup]
  )

  return {
    settingsDialog,
    setSettingsDialog,
    settingsTarget,
    handleOpenProjectGroupSettings,
    handleSubmitProjectGroupSettings
  }
}
