import type { ClaudeHomeBindingCatalogSource } from './claude-structured-account-home'

/** A hydrated project catalog with no groups, so no workspace has a Claude home binding. */
export const EMPTY_CLAUDE_HOME_BINDING_CATALOG: ClaudeHomeBindingCatalogSource = {
  hasHydratedProjectCatalog: () => true,
  getProjectGroups: () => [],
  getRepos: () => [],
  getFolderWorkspaces: () => []
}
