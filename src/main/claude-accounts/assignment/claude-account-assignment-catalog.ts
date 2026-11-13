import {
  hostClaudeAccountIds,
  resolveClaudeAccountScopeForWorkspace,
  type ClaudeAccountScope
} from '../../../shared/claude-account-assignment'
import type { Store } from '../../persistence/loading-store/store'
import { ClaudeAccountAssignmentUnavailableError } from '../profiles/routing/claude-profile-launch-errors'

export type ClaudeAccountAssignmentStore = Pick<
  Store,
  | 'getSettings'
  | 'hasHydratedProjectCatalog'
  | 'getProjectGroups'
  | 'getRepos'
  | 'getFolderWorkspaces'
>

/** Reads the catalog per call, so each launch sees the current assignments. */
export function claudeAccountScopeReader(
  store: ClaudeAccountAssignmentStore
): (workspaceId: string) => ClaudeAccountScope | null {
  return (workspaceId) => {
    // Unloaded rows read as "nothing assigned", which would launch the global account instead.
    if (!store.hasHydratedProjectCatalog()) {
      throw new ClaudeAccountAssignmentUnavailableError()
    }
    return resolveClaudeAccountScopeForWorkspace({
      repos: store.getRepos(),
      folderWorkspaces: store.getFolderWorkspaces(),
      groups: store.getProjectGroups(),
      knownAccountIds: hostClaudeAccountIds(store.getSettings().claudeManagedAccounts),
      workspaceId
    })
  }
}
