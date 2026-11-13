import type {
  ClaudeAccountAssignment,
  ClaudeAccountAssignmentSource
} from '../../../../shared/claude-account-assignment'
import type { ClaudeProfileRouter } from './claude-profile-router'
import {
  CLAUDE_PROFILE_MISSING_MESSAGE,
  CLAUDE_PROFILE_SETUP_FAILED_MESSAGE
} from '../../../../shared/claude-profile-routing'
import '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter'
import { AgentSessionPreSpawnError } from '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'

export function claudeProfileMissing(): AgentSessionPreSpawnError {
  return new AgentSessionPreSpawnError(new Error(CLAUDE_PROFILE_MISSING_MESSAGE), {
    reason: 'claudeAccountFolderMissing'
  })
}

export function claudeProfileSetupFailed(): AgentSessionPreSpawnError {
  return new AgentSessionPreSpawnError(new Error(CLAUDE_PROFILE_SETUP_FAILED_MESSAGE), {
    reason: 'claudeAccountSetupFailed'
  })
}

/** A scope's assigned account holds no login; nothing may run it under another account instead. */
export class ClaudeAssignedAccountSignedOutError extends Error {
  constructor(email: string, source: ClaudeAccountAssignmentSource) {
    super(
      `Claude account ${email} is assigned to ${source.kind === 'group' ? 'group' : 'project'} "${source.name}" but is signed out. Sign in to it in Settings → Accounts, or change the assignment.`
    )
    this.name = 'ClaudeAssignedAccountSignedOutError'
  }
}

/** An unloaded catalog reads like "nothing assigned", which would launch the wrong account. */
export class ClaudeAccountAssignmentUnavailableError extends Error {
  constructor() {
    super(
      'Orca has not finished loading projects, so it cannot tell which Claude account this workspace uses. Try again in a moment.'
    )
    this.name = 'ClaudeAccountAssignmentUnavailableError'
  }
}

/** Refuse rather than run an assigned scope under whichever account happens to be signed in. */
export function assertAssignedClaudeAccountSignedIn(
  router: Pick<ClaudeProfileRouter, 'accountLogin' | 'coveredBySystemDefault' | 'savedAccount'>,
  assignment: ClaudeAccountAssignment | null
): void {
  if (
    assignment &&
    !router.accountLogin(assignment.accountId) &&
    !router.coveredBySystemDefault(assignment.accountId)
  ) {
    throw new ClaudeAssignedAccountSignedOutError(
      router.savedAccount(assignment.accountId)?.email ?? assignment.accountId,
      assignment.source
    )
  }
}
