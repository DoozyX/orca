import { describe, expect, it } from 'vitest'
import {
  buildMergedProjectGroupLookup,
  mergeProjectGroupsAcrossHosts
} from './cross-host-project-group-merge'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'

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
    const local = group({ id: 'local-adaptam', name: 'adaptam', parentPath: '/Users/a/Adaptam' })
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
    const localChild = group({ id: 'local-child', name: 'tools', parentGroupId: 'local-root' })
    const remoteParent = group({ id: 'remote-root', name: 'doozyx', executionHostId: 'runtime:m1' })
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
      group({ id: 'local-child', name: 'tools', parentGroupId: 'local-parent' }),
      group({ id: 'remote-child', name: 'tools', executionHostId: 'runtime:m1' })
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

  it('terminates on a cyclic parent chain', () => {
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'a', name: 'loop-a', parentGroupId: 'b' }),
      group({ id: 'b', name: 'loop-b', parentGroupId: 'a' })
    ])

    expect(merged).toHaveLength(2)
  })
})

describe('buildMergedProjectGroupLookup', () => {
  it('resolves every host copy id to the merged row', () => {
    const merged = mergeProjectGroupsAcrossHosts([
      group({ id: 'local-adaptam', name: 'adaptam' }),
      group({ id: 'remote-adaptam', name: 'adaptam', executionHostId: 'runtime:m1' })
    ])
    const lookup = buildMergedProjectGroupLookup(merged)

    expect(lookup.get('remote-adaptam')?.primary.id).toBe('local-adaptam')
    expect(lookup.get('local-adaptam')?.primary.id).toBe('local-adaptam')
  })
})
