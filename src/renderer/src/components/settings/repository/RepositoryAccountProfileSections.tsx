import type React from 'react'
import type { Repo } from '../../../../../shared/repository/repo-types'
import {
  RepositoryBrowserProfileSection,
  getRepositoryBrowserProfileSearchEntry
} from './RepositoryBrowserProfileSection'
import {
  RepositoryClaudeAccountSection,
  getRepositoryClaudeAccountSearchEntries
} from './RepositoryClaudeAccountSection'
import type { SettingsSearchEntry } from '../search/settings-search'
import type { Translate } from '@/i18n/use-translate'

export function getRepositoryAccountProfileSearchEntries(
  repo: Repo,
  t: Translate
): SettingsSearchEntry[] {
  return [
    ...getRepositoryClaudeAccountSearchEntries(repo, t),
    getRepositoryBrowserProfileSearchEntry(t)
  ]
}

export function RepositoryAccountProfileSections({
  repo,
  updateRepo,
  forceVisible
}: {
  repo: Repo
  updateRepo: (
    repoId: string,
    updates: { claudeAccountId?: string | null; browserProfileId?: string | null }
  ) => void | Promise<boolean>
  forceVisible: boolean
}): React.JSX.Element {
  return (
    <>
      <RepositoryClaudeAccountSection
        repo={repo}
        updateRepo={updateRepo}
        forceVisible={forceVisible}
      />
      <RepositoryBrowserProfileSection
        repo={repo}
        updateRepo={updateRepo}
        forceVisible={forceVisible}
      />
    </>
  )
}
