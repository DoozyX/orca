/**
 * Reveal and nesting for a project group whose same-id host copies disagree on parents
 * (#30045): every walk follows the drawn copy, and a parent loop must not hide groups.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from './worktree-list/grouping/build-rows.test-fixture'
import { repo, worktree } from './worktree-list-groups-test-fixtures'
import { getSidebarRowRevealAncestorKeys } from './worktree-list/navigation/reveal-ancestors'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../../shared/execution-host'

const REMOTE_HOST: ExecutionHostId = 'runtime:env-b'

function group(
  id: string,
  executionHostId: ExecutionHostId,
  parentGroupId: string | null = null
): ProjectGroup {
  return {
    id,
    name: id,
    parentPath: null,
    executionHostId,
    parentGroupId,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1
  }
}

function rowsFor(groupedRepo: Repo, projectGroups: readonly ProjectGroup[]) {
  const entry: Worktree = { ...worktree, hostId: 'local' }
  return buildRows(
    'repo',
    [entry],
    new Map([[groupedRepo.id, groupedRepo]]),
    null,
    new Set<string>(),
    undefined,
    undefined,
    undefined,
    {},
    new Map([[entry.id, entry]]),
    false,
    undefined,
    projectGroups
  )
}

describe('a shared-id project group whose host copies disagree on parents', () => {
  it("reveals a local project through the drawn copy's remote parent", () => {
    const groups = [group('S', 'local'), group('P', REMOTE_HOST), group('S', REMOTE_HOST, 'P')]
    const groupedRepo: Repo = { ...repo, projectGroupId: 'S' }

    expect(
      getSidebarRowRevealAncestorKeys({
        rowKey: `repo:${groupedRepo.id}`,
        repoMap: new Map([[groupedRepo.id, groupedRepo]]),
        projectGroups: groups
      })
    ).toEqual(['project-group:P', 'project-group:S'])
  })

  it('still draws both groups and their project when parents loop across hosts', () => {
    const groups = [
      group('P', 'local'),
      group('G', REMOTE_HOST),
      group('P', REMOTE_HOST, 'G'),
      group('G', 'local', 'P')
    ]
    const rows = rowsFor({ ...repo, projectGroupId: 'G' }, groups)

    expect(
      rows.flatMap((row) =>
        row.type === 'header' && row.projectGroup ? [[row.key, row.projectGroupDepth]] : []
      )
    ).toEqual(
      expect.arrayContaining([
        ['project-group:P', 0],
        ['project-group:G', 0]
      ])
    )
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(1)
  })
})
