import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import type { ClaudeAccountChoice } from './use-claude-account-choices'

// Radix Select has no empty value, so "no assignment" needs a name of its own.
const FOLLOW = '__follow__'

export function ClaudeAccountPicker({
  id,
  value,
  accounts,
  followLabel,
  disabled = false,
  ariaLabel,
  onChange
}: {
  id?: string
  /** The scope's own assignment; null follows `followLabel`. */
  value: string | null
  accounts: readonly ClaudeAccountChoice[]
  /** What an unassigned scope runs under, e.g. the global account or a parent group's. */
  followLabel: string
  disabled?: boolean
  ariaLabel: string
  onChange: (accountId: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  // An assignment to an account Orca no longer has reads as unassigned everywhere else too.
  const selected =
    value !== null && accounts.some((account) => account.id === value) ? value : FOLLOW
  return (
    <Select
      value={selected}
      disabled={disabled}
      onValueChange={(next) => onChange(next === FOLLOW ? null : next)}
    >
      <SelectTrigger id={id} size="sm" className="w-full" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FOLLOW}>{followLabel}</SelectItem>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.needsSignIn
              ? t(
                  'auto.components.claudeAccountAssignment.signedOutAccount',
                  '{{email}} (signed out)',
                  { email: account.email }
                )
              : account.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
