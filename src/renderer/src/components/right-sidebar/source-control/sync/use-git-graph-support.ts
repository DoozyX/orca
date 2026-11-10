import { useEffect, useState } from 'react'
import { useSourceControlState } from '../panel/worktree-scope'
import {
  gitGraphScope,
  gitGraphSupport,
  probeGitGraphSupport
} from '@/lib/source-control/graph/git-graph-tab'

export function useGitGraphSupport(worktreeId: string): boolean | null {
  // Hidden section bodies stop these subscriptions; a primitive key keeps unrelated writes from rendering.
  const owner = useSourceControlState((state) =>
    JSON.stringify([worktreeId, gitGraphScope(worktreeId, state)?.route])
  )
  const status = useSourceControlState((state) => {
    const environmentId = gitGraphScope(worktreeId, state)?.route.runtimeEnvironmentId
    return environmentId ? state.runtimeStatusByEnvironmentId.get(environmentId) : undefined
  })
  const [probe, setProbe] = useState<{ owner: string; support: boolean | null }>()
  useEffect(() => {
    let current = true
    setProbe({ owner, support: gitGraphSupport(worktreeId) })
    void probeGitGraphSupport(worktreeId)
      .then((value) => {
        if (current) {
          setProbe({ owner, support: value })
        }
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [worktreeId, owner, status])
  return probe?.owner === owner ? probe.support : null
}
