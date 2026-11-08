import { translate } from '@/i18n/i18n'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import { LOCAL, REMOTE, TAG, isGitRefListTruncated, remoteGroupKey } from './git-ref-groups'

export type LoadedGitRefGroups = {
  refs: GitHistoryItemRef[]
  /** Keys of groups whose page was full, so more refs exist than are listed. */
  cappedKeys: string[]
  errors: string[]
}

const REMOTE_HEAD = /^refs\/remotes\/[^/]+\/HEAD$/
const PROBE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._-'
const MAX_CONCURRENT_REQUESTS = 4

async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENT_REQUESTS }, worker))
  return results
}

function remoteNamesIn(page: GitHistoryItemRef[]): string[] {
  const names = new Set<string>()
  for (const ref of page) {
    if (ref.id.startsWith(REMOTE)) {
      const [remote, ...rest] = ref.id.slice(REMOTE.length).split('/')
      if (remote && rest.length) {
        names.add(remote)
      }
    }
  }
  return [...names]
}

// The refs endpoint caps each reply, so each group is its own query; `query` matches the full refname.
export async function loadGitRefGroups(
  fetchRefs: (query: string) => Promise<GitHistoryItemRef[]>,
  isLive: () => boolean
): Promise<LoadedGitRefGroups> {
  const byId = new Map<string, GitHistoryItemRef>()
  const cappedKeys: string[] = []
  const errors: string[] = []
  const attempt = async (prefix: string): Promise<GitHistoryItemRef[] | undefined> => {
    if (!isLive()) {
      return undefined
    }
    try {
      return await fetchRefs(prefix)
    } catch (cause) {
      console.error(`Could not load git refs for ${prefix}`, cause)
      errors.push(
        translate('gitGraph.groupLoadFailed', 'Could not load {{refs}}: {{reason}}', {
          refs: prefix,
          reason: cause instanceof Error ? cause.message : String(cause)
        })
      )
      return undefined
    }
  }
  const addGroup = (page: GitHistoryItemRef[], prefix: string, key: string) => {
    for (const ref of page) {
      if (ref.id.startsWith(prefix) && !REMOTE_HEAD.test(ref.id)) {
        byId.set(ref.id, ref)
      }
    }
    if (isGitRefListTruncated(page)) {
      cappedKeys.push(key)
    }
  }
  const [heads, tags, remotes] = await Promise.all([attempt(LOCAL), attempt(TAG), attempt(REMOTE)])
  if (heads) {
    addGroup(heads, LOCAL, 'local')
  }
  if (tags) {
    addGroup(tags, TAG, 'tags')
  }
  if (remotes && !isGitRefListTruncated(remotes)) {
    for (const remote of remoteNamesIn(remotes)) {
      addGroup(remotes, `${REMOTE}${remote}/`, remoteGroupKey(remote))
    }
  } else if (remotes) {
    const failuresBefore = errors.length
    const probes = await mapLimited([...PROBE_CHARS], (char) => attempt(`${REMOTE}${char}`))
    // One unreachable host fails every probe alike; show the first.
    errors.splice(failuresBefore + 1)
    const names = new Set(probes.flatMap((page) => (page ? remoteNamesIn(page) : [])))
    await mapLimited([...names], async (remote) => {
      const prefix = `${REMOTE}${remote}/`
      const page = await attempt(prefix)
      if (page) {
        addGroup(page, prefix, remoteGroupKey(remote))
      }
    })
  }
  return { refs: [...byId.values()], cappedKeys, errors }
}
