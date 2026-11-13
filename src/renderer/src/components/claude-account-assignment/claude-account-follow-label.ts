import { translate } from '@/i18n/i18n'
import type { ClaudeAccountAssignment } from '../../../../shared/claude-account-assignment'
import type { ClaudeAccountChoice } from './use-claude-account-choices'

/** Names what a scope with no assignment of its own runs under. */
export function claudeAccountFollowLabel(
  inherited: ClaudeAccountAssignment | null,
  accounts: readonly ClaudeAccountChoice[]
): string {
  const email = inherited
    ? accounts.find((account) => account.id === inherited.accountId)?.email
    : undefined
  if (!inherited || !email) {
    return translate(
      'auto.components.claudeAccountAssignment.followGlobal',
      'Follow global account'
    )
  }
  return translate(
    'auto.components.claudeAccountAssignment.followGroup',
    'From group {{group}}: {{email}}',
    { group: inherited.source.name, email }
  )
}
