import { useAppStore } from '@/store'
import { openUncommittedEntry } from '@/components/right-sidebar/source-control/listing/open-uncommitted-entry'
import {
  shouldOpenSourceControlRowAsPreview,
  type SourceControlRowOpenEvent
} from '@/components/right-sidebar/source-control/listing/split-open'
import type { gitGraphScope } from '@/lib/git-graph-tab'
import type { GitStatusEntry } from '../../../../../shared/git/status/git-status-types'
import type { GitGraphWipWorkspace } from './git-graph-wip-items'

// The diff opens in the graph's workspace, so reviewing another workspace never switches away.
export function openGitGraphWipEntry(
  graphWorktreeId: string,
  scope: NonNullable<ReturnType<typeof gitGraphScope>>,
  workspace: GitGraphWipWorkspace,
  entry: GitStatusEntry,
  event?: SourceControlRowOpenEvent
): void {
  openUncommittedEntry(
    useAppStore.getState(),
    workspace.worktreeId,
    workspace.worktreePath,
    entry,
    {
      preview: shouldOpenSourceControlRowAsPreview(event, undefined),
      placementWorkspaceId: graphWorktreeId,
      executionHostId: scope.route.executionHostId ?? undefined,
      runtimeEnvironmentId: scope.route.runtimeEnvironmentId
    }
  )
}
