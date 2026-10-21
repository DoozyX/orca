import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import {
  emptyClaudeAccountsState,
  emptyCodexAccountsState,
  watchProviderAccounts,
  type ProviderAccountsSnapshot
} from '@/runtime/runtime-provider-accounts-client'
import {
  runtimeTargetEnvironmentId,
  runtimeTargetForOwnerEnvironment
} from '@/runtime/runtime-client-target'
import { useActiveAccountOwner } from '@/runtime/use-worktree-runtime-target'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { resolveClaudeStatusAccountState } from './status-bar-claude-accounts'
import { resolveCodexStatusAccountState } from './status-bar-codex-accounts'
import { useOwnerUsageRateLimits } from './use-owner-usage-rate-limits'

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
  const { target: ownerAccountTarget } = useActiveAccountOwner(LOCAL_TARGET)
  const environmentId = runtimeTargetEnvironmentId(ownerAccountTarget)
  const ownerKey = environmentId ? `environment:${environmentId}` : 'local'
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
    if (!visible || (!environmentId && !showClaude && !showCodex)) {
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
  }, [ownerTarget, ownerKey, visible, environmentId, claudeKey, codexKey, showClaude, showCodex])

  const refreshPreviews = useCallback(async () => {
    if (environmentId) {
      return
    }
    await Promise.all([
      showClaude ? fetchClaude() : undefined,
      showCodex ? fetchCodex() : undefined
    ])
  }, [environmentId, fetchClaude, fetchCodex, showClaude, showCodex])

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

  const accounts: ProviderAccountsSnapshot = {
    ...snapshot,
    claude: resolveClaudeStatusAccountState(settings, snapshot.claude, environmentId),
    codex: resolveCodexStatusAccountState(settings, snapshot.codex, environmentId)
  }
  return {
    accounts,
    ownerKey,
    rateLimits: owner.rateLimits,
    remoteOwner: owner.remoteOwner,
    refreshUsage,
    refreshPreviews
  }
}
