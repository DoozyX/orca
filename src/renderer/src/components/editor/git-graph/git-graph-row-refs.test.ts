import { describe, expect, it } from 'vitest'
import { groupGitGraphRowRefs } from './git-graph-row-refs'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'

const local = (name: string): GitHistoryItemRef => ({ id: `refs/heads/${name}`, name })
const remote = (name: string): GitHistoryItemRef => ({ id: `refs/remotes/${name}`, name })
const tag = (name: string): GitHistoryItemRef => ({ id: `refs/tags/${name}`, name })

describe('groupGitGraphRowRefs', () => {
  it('merges a local branch with its remote counterpart on one commit', () => {
    const entries = groupGitGraphRowRefs([local('main'), remote('origin/main')])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ name: 'main', local: local('main'), current: false })
    expect(entries[0]!.remotes).toEqual([remote('origin/main')])
  })

  it('orders current first, then local, remote-only and tags', () => {
    const entries = groupGitGraphRowRefs(
      [tag('v1'), remote('origin/dev'), local('feature'), local('main')],
      'refs/heads/main'
    )
    expect(entries.map((entry) => entry.name)).toEqual(['main', 'feature', 'origin/dev', 'v1'])
    expect(entries[0]!.current).toBe(true)
  })
})
