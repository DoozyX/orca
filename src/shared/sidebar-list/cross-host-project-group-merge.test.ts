import { describe, expect, it } from 'vitest'
import {
  buildMergedProjectGroupIndex,
  buildProjectGroupHostIndex,
  findMergedProjectGroup,
  findMergedProjectGroupByRowId,
  findProjectGroupByHost,
  getMergedProjectGroupAncestry,
  getMergedProjectGroupParent,
  mergeProjectGroupsAcrossHosts,
  resolveMergedProjectGroupId
} from './cross-host-project-group-merge'
import type { ProjectGroup } from '../project-group-types'

function group(overrides: Partial<ProjectGroup> & Pick<ProjectGroup, 'id' | 'name'>): ProjectGroup {
  return {
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'folder-scan',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('mergeProjectGroupsAcrossHosts', () => {
  it('folds same-named copies from two hosts into one row', () => {
    const local = group({
      id: 'local-adaptam',
      name: 'adaptam',
      parentPath: '/Users/a/Adaptam'
    })
    const remote = group({
      id: 'remote-adaptam',
      name: 'adaptam',
      parentPath: '/Users/b/Adaptam',
      executionHostId: 'runtime:m1'
    })

    const merged = mergeProjectGroupsAcrossHosts([remote, local])

    expect(merged).toHaveLength(1)
    expect(merged[0].primary).toBe(local)
    expect(merged[0].members).toEqual([remote, local])
  })

  it('keeps differently named groups apart', () => {
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'a', name: 'adaptam' }),
      group({ id: 'b', name: 'fjordbyte', executionHostId: 'runtime:m1' })
    ])

    expect(merged.map((entry) => entry.primary.id)).toEqual(['a', 'b'])
  })

  it('merges on the whole parent chain, not the leaf name alone', () => {
    const localParent = group({ id: 'local-root', name: 'doozyx' })
    const localChild = group({
      id: 'local-child',
      name: 'tools',
      parentGroupId: 'local-root'
    })
    const remoteParent = group({
      id: 'remote-root',
      name: 'doozyx',
      executionHostId: 'runtime:m1'
    })
    const remoteChild = group({
      id: 'remote-child',
      name: 'tools',
      parentGroupId: 'remote-root',
      executionHostId: 'runtime:m1'
    })
    const unrelatedTopLevel = group({ id: 'top-tools', name: 'tools' })

    const merged = mergeProjectGroupsAcrossHosts([
      localParent,
      localChild,
      remoteParent,
      remoteChild,
      unrelatedTopLevel
    ])

    expect(
      merged.map((entry) => [entry.primary.id, entry.members.map((member) => member.id)])
    ).toEqual([
      ['local-root', ['local-root', 'remote-root']],
      ['local-child', ['local-child', 'remote-child']],
      ['top-tools', ['top-tools']]
    ])
  })

  it('does not merge a remote child into a same-named group on another host branch', () => {
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'local-parent', name: 'work' }),
      group({
        id: 'local-child',
        name: 'tools',
        parentGroupId: 'local-parent'
      }),
      group({
        id: 'remote-child',
        name: 'tools',
        executionHostId: 'runtime:m1'
      })
    ])

    expect(merged.map((entry) => entry.primary.id)).toEqual([
      'local-parent',
      'local-child',
      'remote-child'
    ])
  })

  it('ignores case and surrounding whitespace when matching names', () => {
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'local', name: 'Adaptam' }),
      group({ id: 'remote', name: ' adaptam ', executionHostId: 'runtime:m1' })
    ])

    expect(merged).toHaveLength(1)
  })

  it('picks a stable primary when neither copy is local', () => {
    const older = group({
      id: 'b',
      name: 'adaptam',
      createdAt: 10,
      executionHostId: 'runtime:m1'
    })
    const newer = group({
      id: 'a',
      name: 'adaptam',
      createdAt: 20,
      executionHostId: 'runtime:m2'
    })

    expect(mergeProjectGroupsAcrossHosts([newer, older])[0].primary).toBe(older)
    expect(mergeProjectGroupsAcrossHosts([older, newer])[0].primary).toBe(older)
  })

  it('keeps two same-named groups on one host apart', () => {
    // Why: same-host siblings are two real groups the user can move projects
    // between; folding them would make one of them unreachable.
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'local-a', name: 'adaptam', createdAt: 1 }),
      group({ id: 'local-b', name: 'adaptam', createdAt: 2 }),
      group({ id: 'remote-a', name: 'adaptam', executionHostId: 'runtime:m1' })
    ])

    expect(merged.map((entry) => entry.primary.id)).toEqual(['local-a', 'local-b', 'remote-a'])
    expect(merged.every((entry) => entry.members.length === 1)).toBe(true)
  })

  it('does not merge name chains that only collide once flattened', () => {
    // Why: a folder-scan group name is a relative path and can contain a slash.
    const parent = group({ id: 'local-parent', name: 'packages' })
    const nested = group({
      id: 'local-nested',
      name: 'shared',
      parentGroupId: 'local-parent'
    })
    const flat = group({
      id: 'remote-flat',
      name: 'packages/shared',
      executionHostId: 'runtime:m1'
    })

    const merged = mergeProjectGroupsAcrossHosts([parent, nested, flat])

    expect(merged.map((entry) => entry.primary.id)).toEqual([
      'local-parent',
      'local-nested',
      'remote-flat'
    ])
  })

  it('terminates on a cyclic parent chain', () => {
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'a', name: 'loop-a', parentGroupId: 'b' }),
      group({ id: 'b', name: 'loop-b', parentGroupId: 'a' })
    ])

    expect(merged).toHaveLength(2)
  })
})

describe('buildMergedProjectGroupIndex', () => {
  it('resolves every host copy id to the merged row', () => {
    const index = buildMergedProjectGroupIndex([
      group({ id: 'local-adaptam', name: 'adaptam' }),
      group({
        id: 'remote-adaptam',
        name: 'adaptam',
        executionHostId: 'runtime:m1'
      })
    ])

    expect(resolveMergedProjectGroupId(index, 'remote-adaptam')).toBe('local-adaptam')
    expect(resolveMergedProjectGroupId(index, 'local-adaptam')).toBe('local-adaptam')
  })

  it('folds two hosts that publish one group id under different names, last copy drawn (#30045)', () => {
    const local = group({ id: 'shared-id', name: 'adaptam' })
    const remote = group({
      id: 'shared-id',
      name: 'fjordbyte',
      executionHostId: 'runtime:m1'
    })
    const index = buildMergedProjectGroupIndex([local, remote])

    expect(index.merged).toHaveLength(1)
    expect(findMergedProjectGroup(index, 'shared-id', 'local')).toBe(index.merged[0])
    expect(findMergedProjectGroup(index, 'shared-id', 'runtime:m1')).toBe(index.merged[0])
    expect(findMergedProjectGroup(index, 'shared-id')?.primary).toBe(remote)
    expect(index.merged[0].rowId).toBe('shared-id')
  })

  it("folds a third host's same-named copy into a shared-id row", () => {
    const local = group({ id: 'x', name: 'Platform' })
    const server = group({ id: 'x', name: 'Platform', executionHostId: 'runtime:server' })
    const ssh = group({ id: 'z', name: 'Platform', executionHostId: 'ssh:builder' })

    const merged = mergeProjectGroupsAcrossHosts([local, server, ssh])

    expect(merged).toHaveLength(1)
    expect(merged[0].members).toEqual([local, server, ssh])
    expect(merged[0].primary).toBe(server)
  })

  it('never folds two copies from one host through a shared id', () => {
    const local = group({ id: 'x', name: 'Platform' })
    const remote = group({ id: 'x', name: 'Infra', executionHostId: 'runtime:m1' })
    const localInfra = group({ id: 'y', name: 'Infra' })

    const merged = mergeProjectGroupsAcrossHosts([local, remote, localInfra])

    expect(merged.map((entry) => entry.members)).toEqual([[local, remote], [localInfra]])
  })

  it('draws a row top-level when folded copies make its parents loop', () => {
    const localP = group({ id: 'P', name: 'P' })
    const remoteG = group({ id: 'G', name: 'G', executionHostId: 'runtime:m1' })
    const remoteP = group({
      id: 'P',
      name: 'P',
      parentGroupId: 'G',
      executionHostId: 'runtime:m1'
    })
    const localG = group({ id: 'G', name: 'G', parentGroupId: 'P' })
    const index = buildMergedProjectGroupIndex([localP, remoteG, remoteP, localG])

    expect(index.merged).toHaveLength(2)
    for (const row of index.merged) {
      expect(getMergedProjectGroupParent(index, row)).toBeUndefined()
      expect(getMergedProjectGroupAncestry(index, row)).toEqual([row])
    }
  })

  it("walks a shared-id row up its drawn copy's parents", () => {
    const localS = group({ id: 'S', name: 'S' })
    const remoteP = group({ id: 'P', name: 'P', executionHostId: 'runtime:m1' })
    const remoteS = group({
      id: 'S',
      name: 'S',
      parentGroupId: 'P',
      executionHostId: 'runtime:m1'
    })
    const index = buildMergedProjectGroupIndex([localS, remoteP, remoteS])
    const row = findMergedProjectGroup(index, 'S', 'local')

    expect(row && getMergedProjectGroupAncestry(index, row).map((entry) => entry.rowId)).toEqual([
      'P',
      'S'
    ])
  })

  it('nests a same-named child under a shared-id parent once', () => {
    const localParent = group({ id: 'parent', name: 'adaptam' })
    const remoteParent = group({ id: 'parent', name: 'renamed', executionHostId: 'runtime:m1' })
    const localChild = group({ id: 'local-child', name: 'web', parentGroupId: 'parent' })
    const remoteChild = group({
      id: 'remote-child',
      name: 'web',
      parentGroupId: 'parent',
      executionHostId: 'runtime:m1'
    })

    const merged = mergeProjectGroupsAcrossHosts([
      localParent,
      remoteParent,
      localChild,
      remoteChild
    ])

    expect(merged.map((entry) => entry.members.length)).toEqual([2, 2])
    expect(merged[1].primary).toBe(localChild)
  })

  it('keeps an unknown group id addressable by falling back to itself', () => {
    const index = buildMergedProjectGroupIndex([group({ id: 'known', name: 'adaptam' })])

    expect(resolveMergedProjectGroupId(index, 'not-fetched-yet')).toBe('not-fetched-yet')
  })

  it('memoizes on the project-group array identity', () => {
    const groups = [group({ id: 'a', name: 'adaptam' })]

    expect(buildMergedProjectGroupIndex(groups)).toBe(buildMergedProjectGroupIndex(groups))
  })
})

describe('host-qualified lookups', () => {
  it('does not fall back to another host after a host-qualified miss', () => {
    const remote = group({
      id: 'adaptam',
      name: 'adaptam',
      executionHostId: 'runtime:m1'
    })
    const index = buildMergedProjectGroupIndex([remote])

    expect(findMergedProjectGroup(index, 'adaptam', 'local')).toBeUndefined()
    expect(resolveMergedProjectGroupId(index, 'adaptam', 'local')).toBe('adaptam')
    expect(findMergedProjectGroup(index, 'adaptam', 'runtime:m1')).toBe(index.merged[0])
  })

  it('gives every host copy of a shared group id the one row id', () => {
    const local = group({ id: 'shared-id', name: 'adaptam' })
    const remote = group({
      id: 'shared-id',
      name: 'fjordbyte',
      executionHostId: 'runtime:m1'
    })
    const index = buildMergedProjectGroupIndex([local, remote])

    const localRowId = resolveMergedProjectGroupId(index, 'shared-id', 'local')
    expect(resolveMergedProjectGroupId(index, 'shared-id', 'runtime:m1')).toBe(localRowId)
    expect(findMergedProjectGroupByRowId(index, localRowId)?.primary).toBe(remote)
  })

  it('leaves the row id as the plain primary id when no id is reused', () => {
    const index = buildMergedProjectGroupIndex([
      group({ id: 'local-adaptam', name: 'adaptam' }),
      group({
        id: 'remote-adaptam',
        name: 'adaptam',
        executionHostId: 'runtime:m1'
      })
    ])

    expect(index.merged[0].rowId).toBe('local-adaptam')
    expect(findMergedProjectGroupByRowId(index, 'local-adaptam')).toBe(index.merged[0])
  })
})

describe('buildProjectGroupHostIndex', () => {
  it('scopes a raw group lookup to its owning host', () => {
    const local = group({ id: 'shared-id', name: 'adaptam' })
    const remote = group({
      id: 'shared-id',
      name: 'fjordbyte',
      executionHostId: 'runtime:m1'
    })
    const index = buildProjectGroupHostIndex([local, remote])

    expect(findProjectGroupByHost(index, 'shared-id', 'local')).toBe(local)
    expect(findProjectGroupByHost(index, 'shared-id', 'runtime:m1')).toBe(remote)
    expect(findProjectGroupByHost(index, 'shared-id')).toBeUndefined()
    expect(findProjectGroupByHost(index, 'shared-id', 'runtime:m2')).toBeUndefined()
  })

  it('answers an id-only lookup when that id belongs to one group', () => {
    const only = group({
      id: 'adaptam',
      name: 'adaptam',
      executionHostId: 'runtime:m1'
    })

    expect(findProjectGroupByHost(buildProjectGroupHostIndex([only]), 'adaptam')).toBe(only)
  })

  it('memoizes on the project-group array identity', () => {
    const groups = [group({ id: 'a', name: 'adaptam' })]

    expect(buildProjectGroupHostIndex(groups)).toBe(buildProjectGroupHostIndex(groups))
  })
})
