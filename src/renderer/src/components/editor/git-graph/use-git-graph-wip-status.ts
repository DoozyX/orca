import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import type { gitGraphScope } from '@/lib/source-control/graph/git-graph-tab'
import { getRuntimeGitStatus } from '@/runtime/source-control/git/runtime-git-status-client'
import { forEachWithConcurrency } from '../../../../../shared/map-with-concurrency'
import type { GitStatusEntry } from '../../../../../shared/git/status/git-status-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import type { GitGraphWipWorkspace } from './git-graph-wip-items'
import {
  gitGraphOwnerKey,
  gitGraphWorkspaceBranchRefId,
  gitGraphWorkspaceCatalog
} from './git-graph-workspace-navigation'

const STATUS_CONCURRENCY = 4
const STATUS_TIMEOUT_MS = 15_000

type FetchedStatus = { entries: GitStatusEntry[]; head?: string; didHitLimit: boolean }

function toWipWorkspace(
  worktree: Worktree,
  status: FetchedStatus,
  current: boolean
): GitGraphWipWorkspace {
  return {
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    displayName: worktree.displayName,
    branchRefId: worktree.branch ? gitGraphWorkspaceBranchRefId(worktree.branch) : undefined,
    headOid: status.head ?? worktree.head,
    entries: status.entries,
    didHitLimit: status.didHitLimit,
    current
  }
}

// Workspace records churn on every activity bump; keep the previous list until its signature changes.
function useCatalogForSignature(latest: Worktree[], signature: string): Worktree[] {
  const [kept, setKept] = useState({ signature, catalog: latest })
  if (kept.signature !== signature) {
    setKept({ signature, catalog: latest })
    return latest
  }
  return kept.catalog
}

export function useGitGraphWipStatus(scope: ReturnType<typeof gitGraphScope>): {
  workspaces: GitGraphWipWorkspace[]
  refresh: () => void
} {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore(selectWorktreesByRepo)
  const currentId = scope?.worktree.id
  const sourceControlEntries = useAppStore((state) =>
    currentId ? state.gitStatusByWorktree[currentId] : undefined
  )
  const sourceControlHead = useAppStore((state) =>
    currentId ? state.gitStatusHeadByWorktree[currentId] : undefined
  )
  const sourceControlHuge = useAppStore((state) =>
    currentId ? state.gitStatusHugeByWorktree[currentId] : undefined
  )
  const latestCatalog = scope
    ? [scope.worktree, ...gitGraphWorkspaceCatalog(scope, { repos, worktreesByRepo })]
    : []
  // Only the fields used here may rebuild rows.
  const catalogSignature = JSON.stringify(
    latestCatalog.map((worktree) => [
      worktree.id,
      worktree.path,
      worktree.displayName,
      worktree.branch,
      worktree.head
    ])
  )
  const catalog = useCatalogForSignature(latestCatalog, catalogSignature)
  const ownerKey = gitGraphOwnerKey(scope)
  const [fetched, setFetched] = useState<ReadonlyMap<string, FetchedStatus>>(new Map())
  const generation = useRef(0)
  const latest = useRef({ scope, catalog, hasSourceControlStatus: false })
  useEffect(() => {
    latest.current = { scope, catalog, hasSourceControlStatus: sourceControlEntries !== undefined }
  })

  const load = useCallback(() => {
    const { scope: owner, catalog: workspaces, hasSourceControlStatus } = latest.current
    const run = ++generation.current
    if (!owner) {
      setFetched(new Map())
      return
    }
    const targets = workspaces.filter(
      (worktree) => worktree.id !== owner.worktree.id || !hasSourceControlStatus
    )
    void forEachWithConcurrency(targets, STATUS_CONCURRENCY, async (worktree) => {
      if (run !== generation.current) {
        return
      }
      let status: FetchedStatus | undefined
      try {
        const result = await getRuntimeGitStatus(
          {
            target: owner.target,
            worktreeId: worktree.id,
            worktreePath: worktree.path,
            connectionId: owner.connectionId ?? undefined
          },
          {
            admissionTier: 'background',
            includeLineStats: false,
            signal: AbortSignal.timeout(STATUS_TIMEOUT_MS)
          }
        )
        status = {
          entries: result.entries,
          head: result.head,
          didHitLimit: result.didHitLimit === true
        }
      } catch (cause) {
        console.warn(`[git-graph] WIP status failed for ${worktree.path}`, cause)
      }
      if (run !== generation.current) {
        return
      }
      setFetched((previous) => {
        const next = new Map(previous)
        if (status) {
          next.set(worktree.id, status)
        } else {
          next.delete(worktree.id)
        }
        return next
      })
    })
  }, [])

  useEffect(() => {
    load()
  }, [load, ownerKey, catalogSignature])

  const workspaces = useMemo(
    () =>
      catalog.flatMap((worktree) => {
        const current = worktree.id === currentId
        const status =
          current && sourceControlEntries
            ? {
                entries: sourceControlEntries,
                head: sourceControlHead,
                didHitLimit: sourceControlHuge !== undefined
              }
            : fetched.get(worktree.id)
        return status?.entries.length ? [toWipWorkspace(worktree, status, current)] : []
      }),
    [catalog, currentId, fetched, sourceControlEntries, sourceControlHead, sourceControlHuge]
  )
  return { workspaces, refresh: load }
}
