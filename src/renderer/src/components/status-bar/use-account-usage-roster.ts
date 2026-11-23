import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import {
  emptyClaudeAccountsState,
  emptyCodexAccountsState,
  watchProviderAccounts,
  type ProviderAccountsSnapshot
} from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'
import {
  runtimeTargetEnvironmentId,
  runtimeTargetForOwnerEnvironment
} from '@/runtime/rpc/targets/runtime-client-target'
import { useActiveAccountOwner } from '@/runtime/provider-accounts/ownership/use-active-account-owner'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { resolveClaudeStatusAccountState } from './accounts/status-bar-claude-accounts'
import { resolveCodexStatusAccountState } from './accounts/status-bar-codex-accounts'
import { useOwnerUsageRateLimits } from './usage/use-owner-usage-rate-limits'

const LOCAL_TARGET: RuntimeClientTarget = { kind: 'local' }
const EMPTY_ACCOUNTS: ProviderAccountsSnapshot = {
  claude: emptyClaudeAccountsState(),
  codex: emptyCodexAccountsState(),
  rateLimits: null
}

function managedAccountsKey(
  accounts: readonly { id: string; updatedAt: number }[] | undefined,
  activeId: string | null | undefined,
  activeIdsByRuntime: unknown
): string {
  const roster = accounts?.map((account) => `${account.id}:${account.updatedAt}`).join('|') ?? ''
  return `${activeId ?? 'system'}:${JSON.stringify(activeIdsByRuntime ?? null)}:${roster}`
}

export function useAccountUsageRoster() {
  const settings = useAppStore((s) => s.settings)
  const localLimits = useAppStore((s) => s.rateLimits)
  const owner = useOwnerUsageRateLimits(localLimits)
  const visible = useAppStore((s) => s.statusBarVisible)
  const items = useAppStore((s) => s.statusBarItems)
  const fetchClaude = useAppStore((s) => s.fetchInactiveClaudeAccountUsage)
  const fetchCodex = useAppStore((s) => s.fetchInactiveCodexAccountUsage)
  const refreshLocal = useAppStore((s) => s.refreshRateLimits)
  // Why: only the account roster matters here; the owner is already in ownerKey, never the Active Server.
  const claudeKey = managedAccountsKey(
    settings?.claudeManagedAccounts,
    settings?.activeClaudeManagedAccountId,
    settings?.activeClaudeManagedAccountIdsByRuntime
  )
  const codexKey = managedAccountsKey(
    settings?.codexManagedAccounts,
    settings?.activeCodexManagedAccountId,
    settings?.activeCodexManagedAccountIdsByRuntime
  )
  // Why: accounts follow the focused workspace's owner, the same host the usage meters read.
  // Null while the visible host is unreachable: no roster rather than this computer's accounts.
  const accountOwner = useActiveAccountOwner(LOCAL_TARGET)
  const environmentId = accountOwner ? runtimeTargetEnvironmentId(accountOwner.target) : null
  const ownerKey = !accountOwner
    ? 'unavailable'
    : environmentId
      ? `environment:${environmentId}`
      : 'local'
  const ownerTarget = useMemo(
    () => runtimeTargetForOwnerEnvironment(environmentId),
    [environmentId]
  )
  const [received, setReceived] = useState<{
    ownerKey: string
    snapshot: ProviderAccountsSnapshot
  } | null>(null)
  const snapshot = received?.ownerKey === ownerKey ? received.snapshot : EMPTY_ACCOUNTS
  const showClaude = visible && items.includes('claude')
  const showCodex = visible && items.includes('codex')

  useEffect(() => {
    if (!accountOwner || !visible || (!environmentId && !showClaude && !showCodex)) {
      return
    }
    let closed = false
    const watcher = watchProviderAccounts(ownerTarget, {
      onSnapshot: (next) => {
        if (closed) {
          return
        }
        setReceived((previous) => {
          const sameOwner = previous?.ownerKey === ownerKey ? previous.snapshot : EMPTY_ACCOUNTS
          return {
            ownerKey,
            snapshot: {
              ...next,
              claude: next.failedProviders?.includes('claude') ? sameOwner.claude : next.claude,
              codex: next.failedProviders?.includes('codex') ? sameOwner.codex : next.codex
            }
          }
        })
      },
      // Why: the owner's usage hook reports reachability; a dropped accounts stream keeps the last list.
      onError: () => {}
    })
    return () => {
      closed = true
      watcher.close()
    }
  }, [
    accountOwner,
    ownerTarget,
    ownerKey,
    visible,
    environmentId,
    claudeKey,
    codexKey,
    showClaude,
    showCodex
  ])

  const hasAccountOwner = accountOwner !== null
  const refreshPreviews = useCallback(async () => {
    if (!hasAccountOwner || environmentId) {
      return
    }
    await Promise.all([
      showClaude ? fetchClaude() : undefined,
      showCodex ? fetchCodex() : undefined
    ])
  }, [hasAccountOwner, environmentId, fetchClaude, fetchCodex, showClaude, showCodex])

  useEffect(() => {
    void refreshPreviews()
  }, [refreshPreviews, claudeKey, codexKey])

  const { refreshRemote } = owner
  const refreshUsage = useCallback(async () => {
    if (refreshRemote) {
      await refreshRemote()
      return
    }
    await Promise.all([refreshLocal(), refreshPreviews()])
  }, [refreshRemote, refreshLocal, refreshPreviews])

  // The resolvers' local branch reads this computer's settings, which never belong to an unreachable host.
  const accounts: ProviderAccountsSnapshot = hasAccountOwner
    ? {
        ...snapshot,
        claude: resolveClaudeStatusAccountState(settings, snapshot.claude, environmentId),
        codex: resolveCodexStatusAccountState(settings, snapshot.codex, environmentId)
      }
    : EMPTY_ACCOUNTS
  return {
    accounts,
    ownerKey,
    ownerUsage: owner,
    rateLimits: owner.rateLimits,
    remoteOwner: owner.remoteOwner,
    refreshUsage,
    refreshPreviews
  }
}
