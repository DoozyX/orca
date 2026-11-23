import { useAppStore } from '../../store'
import type { ProviderRateLimits } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { getUsageProviderAccountsSectionId } from './usage/usage-provider-settings-target'
import { getUsageOwnerHostScope, type RemoteUsageOwner } from './usage/use-owner-usage-rate-limits'

export function useUsageSettingsNavigation(
  remoteOwner: RemoteUsageOwner | null,
  closeUsageMenu: () => void
) {
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const hostScope = getUsageOwnerHostScope(remoteOwner)

  const handleUsageDetails = (): void => {
    if (!hostScope) {
      return
    }
    closeUsageMenu()
    openSettingsTarget({ pane: 'stats', repoId: null, hostScope })
    openSettingsPage()
  }
  const handleOpenProviderAccounts = (provider: ProviderRateLimits['provider'] | null): void => {
    if (!hostScope) {
      return
    }
    const sectionId = provider ? getUsageProviderAccountsSectionId(provider) : null
    // Why: a placeholder for a CLI-owned provider still leads to the host's accounts.
    if (provider && !sectionId && !remoteOwner) {
      return
    }
    closeUsageMenu()
    openSettingsTarget({
      pane: 'accounts',
      repoId: null,
      hostScope,
      ...(sectionId ? { sectionId } : {})
    })
    openSettingsPage()
  }
  const handleManageAccounts = (): void => handleOpenProviderAccounts(null)
  return { hostScope, handleManageAccounts, handleUsageDetails, handleOpenProviderAccounts }
}
