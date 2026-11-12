import type { ClaudeRateLimitAccountsState } from '../../shared/managed-account-types'
import {
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from '../claude-accounts/selection/runtime-selection'

export function selectedClaudeAccountId(
  state: ClaudeRateLimitAccountsState,
  target: ClaudeAccountSelectionTarget
): string | null {
  return getSelectedClaudeAccountIdForTarget(
    {
      activeClaudeManagedAccountId: state.activeAccountId,
      activeClaudeManagedAccountIdsByRuntime: state.activeAccountIdsByRuntime
    },
    target
  )
}
