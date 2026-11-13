import { describe, expect, it } from 'vitest'
import {
  resolveClaudeAccountAssignmentForWorkspace,
  resolveClaudeAccountScopeForWorkspace
} from './claude-account-assignment'
import type { FolderWorkspace } from './folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from './project-group-types'
import type { Repo } from './repo-types'

function group(overrides: Partial<ProjectGroup> & Pick<ProjectGroup, 'id'>): ProjectGroup {
  return {
    name: overrides.id,
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

function repo(overrides: Partial<Repo> & Pick<Repo, 'id'>): Repo {
  return {
    path: `/work/${overrides.id}`,
    displayName: overrides.id,
    badgeColor: '#999',
    addedAt: 1,
    kind: 'git',
    ...overrides
  }
}

function folderWorkspace(
  overrides: Partial<FolderWorkspace> & Pick<FolderWorkspace, 'id' | 'projectGroupId'>
): FolderWorkspace {
  return {
    name: overrides.id,
    folderPath: `/work/${overrides.id}`,
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

const known = new Set(['acct-work', 'acct-oss'])

function resolve(input: {
  groups: ProjectGroup[]
  repos?: Repo[]
  folderWorkspaces?: FolderWorkspace[]
  workspaceId: string
}) {
  return resolveClaudeAccountAssignmentForWorkspace({
    repos: input.repos ?? [],
    folderWorkspaces: input.folderWorkspaces ?? [],
    groups: input.groups,
    knownAccountIds: known,
    workspaceId: input.workspaceId
  })
}

describe('resolveClaudeAccountAssignmentForWorkspace', () => {
  it('gives a nested group the nearest ancestor assignment', () => {
    const groups = [
      group({ id: 'root', name: 'Work', claudeAccountId: 'acct-work' }),
      group({ id: 'mid', parentGroupId: 'root' }),
      group({ id: 'leaf', parentGroupId: 'mid' })
    ]
    expect(
      resolve({
        groups,
        repos: [repo({ id: 'r1', projectGroupId: 'leaf' })],
        workspaceId: 'r1::/work/r1/feature'
      })
    ).toEqual({
      accountId: 'acct-work',
      source: { kind: 'group', groupId: 'root', name: 'Work' }
    })
  })

  it('skips an account Orca no longer has and keeps walking up', () => {
    const groups = [
      group({ id: 'root', name: 'Work', claudeAccountId: 'acct-work' }),
      group({ id: 'leaf', parentGroupId: 'root', claudeAccountId: 'acct-removed' })
    ]
    const repos = [repo({ id: 'r1', projectGroupId: 'leaf' })]
    expect(resolve({ groups, repos, workspaceId: 'r1::/work/r1' })?.accountId).toBe('acct-work')
    expect(
      resolve({
        groups: [group({ id: 'leaf', claudeAccountId: 'acct-removed' })],
        repos,
        workspaceId: 'r1::/work/r1'
      })
    ).toBeNull()
  })

  it('never lets a row from another host answer', () => {
    const sshGroup = group({ id: 'g', connectionId: 'box', claudeAccountId: 'acct-work' })
    const localGroup = group({ id: 'g', claudeAccountId: 'acct-oss' })
    const localRepo = repo({ id: 'r1', projectGroupId: 'g' })
    const sshRepo = repo({ id: 'r1', projectGroupId: 'g', connectionId: 'box' })
    // A local workspace beside only the SSH copy of its group is unassigned.
    expect(resolve({ groups: [sshGroup], repos: [localRepo], workspaceId: 'r1::/w' })).toBeNull()
    // An SSH workspace is never assigned, even when a local group of the same id is.
    expect(resolve({ groups: [localGroup], repos: [sshRepo], workspaceId: 'r1::/w' })).toBeNull()
    expect(
      resolveClaudeAccountAssignmentForWorkspace({
        repos: [localRepo],
        folderWorkspaces: [],
        groups: [localGroup],
        knownAccountIds: known,
        workspaceId: 'r1::/w',
        executionHostId: 'ssh:box'
      })
    ).toBeNull()
  })

  it('lets a project override its group and fall back when cleared', () => {
    const groups = [group({ id: 'g', name: 'Work', claudeAccountId: 'acct-work' })]
    expect(
      resolve({
        groups,
        repos: [
          repo({ id: 'r1', displayName: 'Side', projectGroupId: 'g', claudeAccountId: 'acct-oss' })
        ],
        workspaceId: 'r1::/w'
      })
    ).toEqual({
      accountId: 'acct-oss',
      source: { kind: 'project', repoId: 'r1', name: 'Side' }
    })
    expect(
      resolve({ groups, repos: [repo({ id: 'r1', projectGroupId: 'g' })], workspaceId: 'r1::/w' })
    ).toEqual({
      accountId: 'acct-work',
      source: { kind: 'group', groupId: 'g', name: 'Work' }
    })
  })

  it('keys a folder workspace by its own id and gives it its group account', () => {
    expect(
      resolveClaudeAccountScopeForWorkspace({
        repos: [],
        folderWorkspaces: [folderWorkspace({ id: 'fw1', projectGroupId: 'g' })],
        groups: [group({ id: 'g', name: 'Work', claudeAccountId: 'acct-work' })],
        knownAccountIds: known,
        workspaceId: 'folder:fw1'
      })
    ).toEqual({
      projectId: 'fw1',
      assignment: {
        accountId: 'acct-work',
        source: { kind: 'group', groupId: 'g', name: 'Work' }
      }
    })
  })
})
