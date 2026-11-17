import type {
  HostSectionRow,
  HostHeaderRow
} from '../../../../../../shared/sidebar-list/hosts/host-section-rows'
import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import { getRootProjectEntryKey } from '../../../../../../shared/sidebar-list/sections/root-project-order'
import {
  getRootProjectHeaderCountByOccurrenceKey,
  getRootProjectHeaderDragKeys,
  getSidebarRootProjectHeaderKeys,
  getRootProjectOrderForSidebarDrop,
  getRootProjectOrderUpdatesForSidebarDrop
} from './root-project-header-drop'

function group(id: string, overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id,
    name: id,
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function repo(id: string, overrides: Partial<Repo> = {}): Repo {
  return { id, path: `/${id}`, displayName: id, badgeColor: '', addedAt: 1, ...overrides }
}

describe('root project header drops', () => {
  it('ranks against the drawn copy when same-id copies disagree on rank', () => {
    const updates = getRootProjectOrderUpdatesForSidebarDrop({
      projectGroups: [
        group('n', { rootProjectOrder: 5 }),
        group('n', { rootProjectOrder: 1, executionHostId: 'runtime:remote' }),
        group('c', { rootProjectOrder: 3, executionHostId: 'runtime:remote' })
      ],
      repos: [],
      visibleKeys: ['group:n', 'group:c'],
      draggedKey: 'group:c',
      dropIndex: 0
    })

    const moved = updates.find((update) => getRootProjectEntryKey(update.entry) === 'group:c')
    expect(moved?.rootProjectOrder).toBeLessThan(1)
  })

  it('moves the visible copy of a folded row when a host filter hides its preferred copy', () => {
    const order = getRootProjectOrderForSidebarDrop({
      projectGroups: [
        group('a', { name: 'Work', rootProjectOrder: 1 }),
        group('b', { name: 'Work', rootProjectOrder: 1, executionHostId: 'runtime:remote' }),
        group('c', { rootProjectOrder: 2, executionHostId: 'runtime:remote' })
      ],
      repos: [],
      visibleKeys: ['group:b', 'group:c'],
      draggedKey: 'group:c',
      dropIndex: 0
    })

    expect(order.map(getRootProjectEntryKey)).toEqual(['group:c', 'group:b'])
  })

  it('moves a row drawn top-level because its parent id exists only on another host', () => {
    const order = getRootProjectOrderForSidebarDrop({
      projectGroups: [
        group('y', { rootProjectOrder: 1, executionHostId: 'runtime:two' }),
        group('x', { rootProjectOrder: 2, executionHostId: 'runtime:one', parentGroupId: 'y' }),
        group('z', { rootProjectOrder: 3, executionHostId: 'runtime:one' })
      ],
      repos: [],
      visibleKeys: ['group:y', 'group:x', 'group:z'],
      draggedKey: 'group:x',
      dropIndex: 0
    })

    expect(order.map(getRootProjectEntryKey)).toEqual(['group:x', 'group:y', 'group:z'])
  })
  it('limits root moves to the source host section', () => {
    expect(
      getRootProjectHeaderDragKeys(
        [
          'group:global',
          'host:local',
          'group:a',
          'repo:x',
          'host:runtime:remote',
          'group:b',
          'repo:y'
        ],
        'repo:x'
      )
    ).toEqual(['group:a', 'repo:x'])
    expect(
      getRootProjectHeaderDragKeys(
        ['host:local', 'group:a', 'host:runtime:remote', 'repo:y'],
        'group:a'
      )
    ).toEqual(['group:a'])
  })

  it('uses the actual host occurrence when repeated logical headers span sections', () => {
    const host = (hostId: HostHeaderRow['hostId']): HostHeaderRow => ({
      type: 'host-header',
      key: hostId,
      hostId,
      kind: hostId === 'local' ? 'local' : 'runtime',
      label: hostId,
      detail: '',
      health: 'available',
      collapsed: false,
      count: 1
    })
    const rows: HostSectionRow[] = [
      host('local'),
      {
        type: 'header',
        key: 'group:a',
        count: 1,
        icon: { kind: 'project' },
        projectGroup: group('a'),
        hostId: 'local'
      },
      {
        type: 'header',
        key: 'repo:x',
        count: 1,
        icon: { kind: 'project' },
        repo: repo('x'),
        hostId: 'local'
      },
      host('runtime:remote'),
      {
        type: 'header',
        key: 'group:a',
        count: 1,
        icon: { kind: 'project' },
        projectGroup: group('a'),
        hostId: 'runtime:remote',
        repeated: true
      },
      {
        type: 'header',
        key: 'repo:remote-x',
        count: 1,
        icon: { kind: 'project' },
        repo: repo('remote-x', { executionHostId: 'runtime:remote' }),
        anchorRepo: repo('x'),
        hostId: 'runtime:remote',
        repeated: true
      },
      {
        type: 'header',
        key: 'repo:y',
        count: 1,
        icon: { kind: 'project' },
        repo: repo('y'),
        hostId: 'runtime:remote'
      }
    ]
    const keys = getSidebarRootProjectHeaderKeys(rows)
    expect(keys).toEqual([
      'host:local',
      'group:a',
      'repo:x',
      'host:runtime:remote',
      'group:a',
      'repo:x',
      'repo:y'
    ])
    expect(getRootProjectHeaderDragKeys(keys, 'group:a', 'runtime:remote')).toEqual([
      'group:a',
      'repo:x',
      'repo:y'
    ])
    expect(getRootProjectHeaderDragKeys(keys, 'repo:y', 'local')).toBeUndefined()
    expect([...getRootProjectHeaderCountByOccurrenceKey(keys)]).toEqual([
      ['["local","group:a"]', 2],
      ['["local","repo:x"]', 2],
      ['["runtime:remote","group:a"]', 3],
      ['["runtime:remote","repo:x"]', 3],
      ['["runtime:remote","repo:y"]', 3]
    ])
  })
})
