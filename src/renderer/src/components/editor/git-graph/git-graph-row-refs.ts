import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'

export type GitGraphRowRef = {
  name: string
  local?: GitHistoryItemRef
  remotes: GitHistoryItemRef[]
  tag?: GitHistoryItemRef
  current: boolean
}

// Remote ref names are `<remote>/<branch>`; the remote name cannot contain a slash here.
function remoteBranchName(ref: GitHistoryItemRef): string {
  return ref.name.slice(ref.name.indexOf('/') + 1)
}

export function groupGitGraphRowRefs(
  refs: GitHistoryItemRef[],
  currentRefId?: string
): GitGraphRowRef[] {
  const locals = new Map<string, GitGraphRowRef>()
  const remoteOnly: GitGraphRowRef[] = []
  const tags: GitGraphRowRef[] = []
  for (const ref of refs) {
    if (ref.id.startsWith('refs/heads/')) {
      locals.set(ref.name, {
        name: ref.name,
        local: ref,
        remotes: [],
        current: ref.id === currentRefId
      })
    }
  }
  for (const ref of refs) {
    if (ref.id.startsWith('refs/remotes/')) {
      const entry = locals.get(remoteBranchName(ref))
      if (entry) {
        entry.remotes.push(ref)
      } else {
        remoteOnly.push({ name: ref.name, remotes: [ref], current: false })
      }
    } else if (ref.id.startsWith('refs/tags/')) {
      tags.push({ name: ref.name, remotes: [], tag: ref, current: false })
    }
  }
  const localEntries = [...locals.values()]
  return [
    ...localEntries.filter((entry) => entry.current),
    ...localEntries.filter((entry) => !entry.current),
    ...remoteOnly,
    ...tags
  ]
}
