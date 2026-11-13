import type { Translate } from '@/i18n/use-translate'
import type { ClaudeAccountAssignment } from '../../../../shared/claude-account-assignment'
import type { ClaudeAccountChoice } from './use-claude-account-choices'

/** Names what a scope with no assignment of its own runs under. */
export function claudeAccountFollowLabel(
  inherited: ClaudeAccountAssignment | null,
  accounts: readonly ClaudeAccountChoice[],
  t: Translate
): string {
  const email = inherited
    ? accounts.find((account) => account.id === inherited.accountId)?.email
    : undefined
  if (!inherited || !email) {
    return t('auto.components.claudeAccountAssignment.followGlobal', 'Follow global account')
  }
  return t(
    'auto.components.claudeAccountAssignment.followGroup',
    'From group {{group}}: {{email}}',
    { group: inherited.source.name, email }
  )
}
