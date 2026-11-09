import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { getRuntimeGitRefs } from '@/runtime/source-control/git/runtime-git-status-client'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import { GIT_HISTORY_REFS_CAPABILITY } from '../../../../../shared/source-control/runtime/git-graph-capabilities'
import { gitGraphRuntimeContext, gitGraphScope, useGitGraphScope } from '@/lib/git-graph-tab'
import { loadGitRefGroups, type LoadedGitRefGroups } from './git-ref-group-loader'
import { groupGitRefs, gitRefGroupKey, isGitRefListTruncated } from './git-ref-groups'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import type { ExecutionHostId } from '../../../../../shared/execution-host'

export type RefRequests = { running: boolean; pending?: () => Promise<void> }

// The owner key resets keyed children when the workspace route or path changes; the queue outlives them.
export function useGitGraphRefOwner(worktreeId: string, executionHostId?: ExecutionHostId) {
  const requests = useRef<RefRequests>({ running: false })
  const scope = useGitGraphScope(worktreeId, executionHostId)
  const owner = JSON.stringify([worktreeId, scope?.route, scope?.worktree.path])
  return { owner, requests }
}

async function drainRefRequests(queue: RefRequests): Promise<void> {
  if (queue.running) {
    return
  }
  queue.running = true
  try {
    while (queue.pending) {
      const next = queue.pending
      queue.pending = undefined
      await next()
    }
  } finally {
    queue.running = false
  }
}

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

type RefSearchInput = {
  worktreeId: string
  executionHostId?: ExecutionHostId
  owner: string
  requests: RefObject<RefRequests>
  query: string
  enabled: boolean
  /** Changing this refetches without clearing the refs already shown. */
  reloadKey?: number
}

export function useGitGraphRefSearch({
  worktreeId,
  executionHostId,
  owner,
  requests,
  query,
  enabled,
  reloadKey
}: RefSearchInput) {
  const [search, setSearch] = useState<{
    owner: string
    query: string
    refs?: GitHistoryItemRef[]
    error?: string
  }>()
  const [probe, setProbe] = useState<{
    owner: string | undefined
    capable: boolean | null
    error?: string
  }>()
  const capable = probe?.owner === owner ? probe?.capable : null
  const probeError = probe?.owner === owner ? probe?.error : undefined
  const current = enabled && search?.owner === owner && search.query === query ? search : undefined
  useEffect(() => {
    let live = true
    setProbe({ owner, capable: null })
    const scope = gitGraphScope(worktreeId, undefined, executionHostId)
    if (scope) {
      void (
        scope.target.kind === 'local'
          ? Promise.resolve(true)
          : runtimeEnvironmentSupportsCapability(
              scope.target.environmentId,
              GIT_HISTORY_REFS_CAPABILITY
            )
      )
        .then((value) => {
          if (live) {
            setProbe({ owner, capable: value })
          }
        })
        .catch((cause: unknown) => {
          if (live) {
            setProbe({ owner, capable: null, error: errorText(cause) })
          }
        })
    }
    return () => {
      live = false
    }
  }, [worktreeId, owner, executionHostId])
  useEffect(() => {
    if (!enabled || !capable) {
      return
    }
    let live = true
    const queue = requests.current
    const timeout = setTimeout(() => {
      queue.pending = async () => {
        const scope = gitGraphScope(worktreeId, undefined, executionHostId)
        if (!live || !scope) {
          return
        }
        try {
          const rows = await getRuntimeGitRefs(gitGraphRuntimeContext(worktreeId, scope), query)
          if (live) {
            setSearch({ owner, query, refs: rows })
          }
        } catch (cause) {
          if (live) {
            setSearch({ owner, query, error: errorText(cause) })
          }
        }
      }
      void drainRefRequests(queue)
    }, 150)
    return () => {
      live = false
      queue.pending = undefined
      clearTimeout(timeout)
    }
  }, [worktreeId, owner, query, enabled, capable, executionHostId, requests, reloadKey])
  const reset = useCallback(() => setSearch(undefined), [])
  return { capable, refs: current?.refs, error: current?.error ?? probeError, reset }
}

type RefsSnapshot = { refs: GitHistoryItemRef[]; cappedKeys: string[] }
type LoadedGroups = LoadedGitRefGroups & { owner: string; reloadKey?: number }

function useGitRefGroups(
  { worktreeId, executionHostId, owner, enabled, reloadKey }: Omit<RefSearchInput, 'query'>,
  capable: boolean | null
) {
  const [loaded, setLoaded] = useState<LoadedGroups>()
  const fresh = loaded?.owner === owner && loaded.reloadKey === reloadKey
  useEffect(() => {
    const scope = gitGraphScope(worktreeId, undefined, executionHostId)
    if (!enabled || !capable || fresh || !scope) {
      return
    }
    let live = true
    void loadGitRefGroups(
      (query) => getRuntimeGitRefs(gitGraphRuntimeContext(worktreeId, scope), query),
      () => live
    )
      .then((result) => {
        if (live) {
          setLoaded({ owner, reloadKey, ...result })
        }
      })
      .catch((cause: unknown) => {
        if (live) {
          setLoaded({ owner, reloadKey, refs: [], cappedKeys: [], errors: [errorText(cause)] })
        }
      })
    return () => {
      live = false
    }
  }, [worktreeId, executionHostId, owner, enabled, capable, fresh, reloadKey])
  return loaded?.owner === owner ? { ...loaded, fresh } : undefined
}

const searchSnapshot = (refs: GitHistoryItemRef[]): RefsSnapshot => ({
  refs,
  cappedKeys: isGitRefListTruncated(refs) ? groupGitRefs(refs).map(gitRefGroupKey) : []
})

export function useGitRefTreeSource(input: Omit<RefSearchInput, 'query'>) {
  const [query, setQuery] = useState('')
  const searching = query !== ''
  const search = useGitGraphRefSearch({ ...input, query, enabled: input.enabled && searching })
  const groups = useGitRefGroups(input, search.capable)
  const searched = useMemo(
    () => (search.refs ? searchSnapshot(search.refs) : undefined),
    [search.refs]
  )
  const [lists, setLists] = useState<{ owner: string; shown: RefsSnapshot }>()
  const own = lists?.owner === input.owner ? lists : undefined
  const next = searching ? searched : groups
  if (next && next.refs !== own?.shown.refs) {
    setLists({ owner: input.owner, shown: { refs: next.refs, cappedKeys: next.cappedKeys } })
  }
  const error = [search.error, ...(groups?.errors ?? [])].filter(Boolean).join(' ')
  return {
    capable: search.capable,
    error: error || undefined,
    setQuery,
    /** The union of every loaded group: the only list that says which refs exist. */
    allRefs: groups?.refs,
    anyGroupCapped: (groups?.cappedKeys.length ?? 0) > 0,
    /** True only when every group loaded whole and is current; a partial list must not decide hide or restore-All. */
    groupsComplete:
      groups !== undefined && groups.fresh && !groups.errors.length && !groups.cappedKeys.length,
    refs: own?.shown.refs,
    cappedKeys: own?.shown.cappedKeys
  }
}
