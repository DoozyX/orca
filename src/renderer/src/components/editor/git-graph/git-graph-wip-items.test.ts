import { describe, expect, it } from 'vitest'
import { buildGitGraphWipItems, type GitGraphWipWorkspace } from './git-graph-wip-items'

const workspace = (overrides: Partial<GitGraphWipWorkspace>): GitGraphWipWorkspace => ({
  worktreeId: 'r::/repo-b',
  worktreePath: '/repo-b',
  displayName: 'b',
  branchRefId: 'refs/heads/b',
  headOid: 'head-b',
  entries: [{ path: 'a.ts', status: 'modified', area: 'unstaged' }],
  didHitLimit: false,
  current: false,
  ...overrides
})

describe('buildGitGraphWipItems', () => {
  it('parents a dirty workspace on a visible branch to its HEAD', () => {
    expect(
      buildGitGraphWipItems({
        workspaces: [workspace({})],
        filter: ['refs/heads/b'],
        loadedIds: new Set()
      })
    ).toEqual([
      { id: 'wip:r::/repo-b', parentIds: ['head-b'], subject: '// WIP', message: '// WIP' }
    ])
  })

  it('leaves out a workspace whose branch the filter hides', () => {
    expect(
      buildGitGraphWipItems({
        workspaces: [workspace({})],
        filter: ['refs/heads/a'],
        loadedIds: new Set()
      })
    ).toEqual([])
  })

  it('shows a detached workspace only while its HEAD is loaded', () => {
    const detached = workspace({ branchRefId: undefined })
    const build = (loadedIds: Set<string>) =>
      buildGitGraphWipItems({ workspaces: [detached], filter: 'all', loadedIds }).length
    expect(build(new Set())).toBe(0)
    expect(build(new Set(['head-b']))).toBe(1)
  })

  it('lists the current workspace first, then the rest by display name', () => {
    const ids = buildGitGraphWipItems({
      workspaces: [
        workspace({ worktreeId: 'z', displayName: 'zed' }),
        workspace({ worktreeId: 'a', displayName: 'alpha' }),
        workspace({ worktreeId: 'm', displayName: 'main', current: true })
      ],
      filter: 'all',
      loadedIds: new Set()
    }).map((item) => item.id)
    expect(ids).toEqual(['wip:m', 'wip:a', 'wip:z'])
  })
})
