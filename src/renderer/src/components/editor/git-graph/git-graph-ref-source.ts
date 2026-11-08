import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { getRuntimeGitRefs } from '@/runtime/source-control/git/runtime-git-status-client'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import { GIT_HISTORY_REFS_CAPABILITY } from '../../../../../shared/source-control/runtime/git-graph-capabilities'
import { gitGraphScope, useGitGraphScope } from '@/lib/git-graph-tab'
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
  const [probe, setProbe] = useState<{ owner: string | undefined; capable: boolean | null }>()
  const capable = probe?.owner === owner ? probe?.capable : null
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
        .catch(() => {})
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
    const drain = async () => {
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
    const timeout = setTimeout(() => {
      queue.pending = async () => {
        const scope = gitGraphScope(worktreeId, undefined, executionHostId)
        if (!live || !scope) {
          return
        }
        try {
          const rows = await getRuntimeGitRefs(
            {
              target: scope.target,
              worktreeId,
              worktreePath: scope.worktree.path,
              connectionId: scope.connectionId ?? undefined
            },
            query
          )
          if (live) {
            setSearch({ owner, query, refs: rows })
          }
        } catch (cause) {
          if (live) {
            setSearch({ owner, query, error: String(cause) })
          }
        }
      }
      void drain()
    }, 150)
    return () => {
      live = false
      queue.pending = undefined
      clearTimeout(timeout)
    }
  }, [worktreeId, owner, query, enabled, capable, executionHostId, requests, reloadKey])
  const reset = useCallback(() => setSearch(undefined), [])
  return { capable, refs: current?.refs, error: current?.error, reset }
}

// The refs endpoint caps its page at 1,000 but filters by `query` first, so searching reaches every ref.
export function useGitRefTreeSource(input: Omit<RefSearchInput, 'query'>) {
  const [query, setQuery] = useState('')
  const { capable, refs, error } = useGitGraphRefSearch({ ...input, query })
  const [lists, setLists] = useState<{
    owner: string
    /** Unfiltered page: the only list that says which refs exist. */
    all?: GitHistoryItemRef[]
    shown?: GitHistoryItemRef[]
  }>()
  const own = lists?.owner === input.owner ? lists : undefined
  if (refs && refs !== own?.shown) {
    setLists({ owner: input.owner, all: query === '' ? refs : own?.all, shown: refs })
  }
  return { capable, error, setQuery, allRefs: own?.all, refs: own?.shown }
}
