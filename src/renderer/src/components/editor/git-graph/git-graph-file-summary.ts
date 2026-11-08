import type { GitFileStatus } from '../../../../../shared/git/status/git-status-types'

export const GIT_FILE_STATUS_SUMMARY_ORDER: readonly GitFileStatus[] = [
  'modified',
  'added',
  'deleted',
  'renamed',
  'copied',
  'untracked'
]

export function summarizeFileChanges(
  entries: readonly { status: GitFileStatus }[]
): Partial<Record<GitFileStatus, number>> {
  const counts: Partial<Record<GitFileStatus, number>> = {}
  for (const entry of entries) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1
  }
  return counts
}
