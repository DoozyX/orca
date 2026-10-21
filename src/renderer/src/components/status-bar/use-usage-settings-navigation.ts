import { useAppStore } from '../../store'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import { getUsageProviderAccountsSectionId } from './usage-provider-settings-target'
import { getUsageOwnerHostScope, type RemoteUsageOwner } from './use-owner-usage-rate-limits'

export function useUsageSettingsNavigation(
  remoteOwner: RemoteUsageOwner | null,
  closeUsageMenu: () => void
) {
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  // Why: the shown accounts are the owning host's; without a scope Settings opens on the default host.
  const hostScope = getUsageOwnerHostScope(remoteOwner)

  const handleManageAccounts = (): void => {
    closeUsageMenu()
    openSettingsTarget({ pane: 'accounts', repoId: null, hostScope })
    openSettingsPage()
  }
  const handleUsageDetails = (): void => {
    closeUsageMenu()
    openSettingsTarget({ pane: 'stats', repoId: null })
    openSettingsPage()
  }
  const handleOpenProviderAccounts = (provider: ProviderRateLimits['provider']): void => {
    const sectionId = getUsageProviderAccountsSectionId(provider)
    // Why: a placeholder for a CLI-owned provider still leads to the host's accounts.
    if (!sectionId && !remoteOwner) {
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
  return { handleManageAccounts, handleUsageDetails, handleOpenProviderAccounts }
}
