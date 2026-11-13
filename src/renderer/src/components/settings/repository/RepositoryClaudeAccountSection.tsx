import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import type { Repo } from '../../../../../shared/repo-types'
import {
  hostClaudeAccountIds,
  resolveClaudeAccountAssignmentForGroup
} from '../../../../../shared/claude-account-assignment'
import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId
} from '../../../../../shared/execution-host'
import { ClaudeAccountPicker } from '../../claude-account-assignment/ClaudeAccountPicker'
import { claudeAccountFollowLabel } from '../../claude-account-assignment/claude-account-follow-label'
import { useClaudeAccountChoices } from '../../claude-account-assignment/use-claude-account-choices'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import type { SettingsSearchEntry } from '../search/settings-search'

export function getRepositoryClaudeAccountSearchEntry(
  t: Translate = translate
): SettingsSearchEntry {
  return {
    title: t('auto.components.claudeAccountAssignment.label', 'Claude account'),
    description: t(
      'auto.components.claudeAccountAssignment.projectDescription',
      'Claude terminals and chats in this project run under this account instead of the global one.'
    ),
    keywords: [
      t('auto.components.claudeAccountAssignment.keywordAccount', 'account'),
      t('auto.components.claudeAccountAssignment.keywordSubscription', 'subscription')
    ]
  }
}

/** Orca accounts exist only on this computer, so a project on another host has nothing to pick. */
export function RepositoryClaudeAccountSection({
  repo,
  updateRepo,
  forceVisible = false
}: {
  repo: Repo
  updateRepo: (
    repoId: string,
    updates: { claudeAccountId: string | null }
  ) => void | Promise<boolean>
  forceVisible?: boolean
}): React.JSX.Element | null {
  const t = useTranslate()
  const accounts = useClaudeAccountChoices()
  const projectGroups = useAppStore((state) => state.projectGroups)
  const savedAccounts = useAppStore((state) => state.settings?.claudeManagedAccounts)
  if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
    return null
  }
  const entry = getRepositoryClaudeAccountSearchEntry(t)
  const inherited = resolveClaudeAccountAssignmentForGroup(
    projectGroups,
    repo.projectGroupId,
    hostClaudeAccountIds(savedAccounts ?? [])
  )
  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={[repo.displayName, ...(entry.keywords ?? [])]}
      className="space-y-3"
      forceVisible={forceVisible}
    >
      <div className="space-y-1">
        <div className="text-sm font-semibold">{entry.title}</div>
        <p className="text-xs text-muted-foreground">
          {accounts.length > 0
            ? entry.description
            : t(
                'auto.components.claudeAccountAssignment.noAccounts',
                'Add a Claude account in Settings → Accounts to assign one here.'
              )}
        </p>
      </div>
      <div className="max-w-sm">
        <ClaudeAccountPicker
          value={repo.claudeAccountId ?? null}
          accounts={accounts}
          followLabel={claudeAccountFollowLabel(inherited, accounts, t)}
          ariaLabel={entry.title}
          onChange={(claudeAccountId) => {
            if (claudeAccountId !== (repo.claudeAccountId ?? null)) {
              void updateRepo(repo.id, { claudeAccountId })
            }
          }}
        />
      </div>
    </SearchableSetting>
  )
}
