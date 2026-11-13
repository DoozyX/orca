import { hostClaudeAccountIds } from '../../../shared/claude-account-assignment'
import { LOCAL_EXECUTION_HOST_ID, getRepoExecutionHostId } from '../../../shared/execution-host'
import type { ClaudeManagedAccount } from '../../../shared/managed-account-types'
import { getClaudeProfileRouter } from '../profiles/routing/claude-profile-installed-router'

export class ClaudeAccountAssignmentRejectedError extends Error {
  constructor(readonly reason: 'not-local' | 'unknown-account') {
    super(
      reason === 'not-local'
        ? 'A Claude account can only be assigned to a group or project on this computer.'
        : 'That Claude account is not one of the Orca accounts on this computer.'
    )
    this.name = 'ClaudeAccountAssignmentRejectedError'
  }
}

/** Orca accounts live on this host only, so a remote row or a foreign id can never be routed. */
export function assertClaudeAccountAssignable(
  row: { connectionId?: string | null; executionHostId?: string | null },
  accountId: string,
  accounts: readonly ClaudeManagedAccount[]
): void {
  if (getRepoExecutionHostId(row) !== LOCAL_EXECUTION_HOST_ID) {
    throw new ClaudeAccountAssignmentRejectedError('not-local')
  }
  if (!hostClaudeAccountIds(accounts).has(accountId)) {
    throw new ClaudeAccountAssignmentRejectedError('unknown-account')
  }
}

/** Open panes re-read their project's pointer, so an assignment change must republish them. */
export function republishClaudeAccountAssignments(): void {
  try {
    getClaudeProfileRouter()?.publishScopePointers()
  } catch (error) {
    console.warn('[claude-profile] Could not update the per-project Claude pointers:', error)
  }
}
