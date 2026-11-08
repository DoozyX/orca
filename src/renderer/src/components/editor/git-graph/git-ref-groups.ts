import {
  GIT_HISTORY_MAX_REFS,
  type GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'

export type GitRefTreeGroup =
  | { kind: 'local'; refs: GitHistoryItemRef[] }
  | { kind: 'remote'; remote: string; refs: GitHistoryItemRef[] }
  | { kind: 'tags'; refs: GitHistoryItemRef[] }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
export const LOCAL = 'refs/heads/'
export const REMOTE = 'refs/remotes/'
export const TAG = 'refs/tags/'

export function groupGitRefs(refs: GitHistoryItemRef[]): GitRefTreeGroup[] {
  const local: GitHistoryItemRef[] = []
  const tags: GitHistoryItemRef[] = []
  const remotes = new Map<string, GitHistoryItemRef[]>()
  for (const ref of refs) {
    if (ref.id.startsWith(LOCAL)) {
      local.push(ref)
    } else if (ref.id.startsWith(TAG)) {
      tags.push(ref)
    } else if (ref.id.startsWith(REMOTE)) {
      const [remote, ...rest] = ref.id.slice(REMOTE.length).split('/')
      if (remote && rest.length && rest.join('/') !== 'HEAD') {
        remotes.set(remote, [...(remotes.get(remote) ?? []), ref])
      }
    }
  }
  const byName = (a: GitHistoryItemRef, b: GitHistoryItemRef) => collator.compare(a.name, b.name)
  const groups: GitRefTreeGroup[] = []
  if (local.length) {
    groups.push({ kind: 'local', refs: local.sort(byName) })
  }
  const remoteNames = [...remotes.keys()].sort(
    (a, b) => Number(b === 'origin') - Number(a === 'origin') || collator.compare(a, b)
  )
  for (const remote of remoteNames) {
    groups.push({ kind: 'remote', remote, refs: remotes.get(remote)!.sort(byName) })
  }
  if (tags.length) {
    groups.push({ kind: 'tags', refs: tags.sort((a, b) => byName(b, a)) })
  }
  return groups
}

export const remoteGroupKey = (remote: string): string => `remote:${remote}`

export function gitRefGroupKey(group: GitRefTreeGroup): string {
  return group.kind === 'remote' ? remoteGroupKey(group.remote) : group.kind
}

export function gitRefDisplayName(group: GitRefTreeGroup, ref: GitHistoryItemRef): string {
  return group.kind === 'remote' ? ref.id.slice(`${REMOTE}${group.remote}/`.length) : ref.name
}

// The refs endpoint returns at most GIT_HISTORY_MAX_REFS entries, so a full page may hide more.
export const isGitRefListTruncated = (refs: GitHistoryItemRef[]): boolean =>
  refs.length >= GIT_HISTORY_MAX_REFS
