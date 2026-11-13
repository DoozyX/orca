import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { emptyClaudeAccountsState } from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { hostClaudeAccountIds } from '../../../../shared/claude-account-assignment'
import { getClaudeAccountRosterSyncKey } from '../status-bar/provider-account-sync-key'
import { useProviderAccountList } from '../status-bar/use-provider-account-list'

export type ClaudeAccountChoice = { id: string; email: string; needsSignIn: boolean }

// Assignments exist only on this computer, so the roster is always the local one.
const LOCAL_TARGET: RuntimeClientTarget = { kind: 'local' }
const NO_ACCOUNTS = emptyClaudeAccountsState()

/** This computer's host-runtime Orca Claude accounts, the only ones a scope can be assigned. */
export function useClaudeAccountChoices(): ClaudeAccountChoice[] {
  const saved = useAppStore((s) => s.settings?.claudeManagedAccounts)
  const syncKey = useAppStore((s) => getClaudeAccountRosterSyncKey(s.settings))
  const { accounts } = useProviderAccountList('claude', LOCAL_TARGET, syncKey, NO_ACCOUNTS)
  return useMemo(() => {
    const hostAccounts = saved ?? []
    const assignable = hostClaudeAccountIds(hostAccounts)
    const signedOut = new Set(
      accounts.accounts.filter((account) => account.needsSignIn).map((account) => account.id)
    )
    return hostAccounts
      .filter((account) => assignable.has(account.id))
      .map((account) => ({
        id: account.id,
        email: account.email,
        needsSignIn: signedOut.has(account.id)
      }))
  }, [saved, accounts])
}
