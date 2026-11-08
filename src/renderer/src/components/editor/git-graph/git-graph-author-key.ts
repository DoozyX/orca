import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

export type GitGraphAuthorCount = { key: string; name: string; email: string; count: number }

export function gitGraphAuthorKey(item: GitHistoryItem): string {
  if (item.authorEmail) {
    return `email:${item.authorEmail.toLowerCase()}`
  }
  return item.author ? `name:${item.author}` : 'unknown'
}

export function countGitGraphAuthors(items: readonly GitHistoryItem[]): GitGraphAuthorCount[] {
  const byKey = new Map<string, GitGraphAuthorCount>()
  for (const item of items) {
    const key = gitGraphAuthorKey(item)
    const entry = byKey.get(key)
    if (entry) {
      entry.count++
    } else {
      byKey.set(key, {
        key,
        name: item.author || item.authorEmail || '',
        email: item.authorEmail ?? '',
        count: 1
      })
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
