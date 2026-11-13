import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hostClaudeAccountIds,
  resolveClaudeAccountScopeForWorkspace
} from '../../../../shared/claude-account-assignment'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import { prepareClaudeLaunchAccount } from '../../../claude/structured/launch/claude-launch-account'
import { claudeAccountScopeReader } from '../../assignment/claude-account-assignment-catalog'
import {
  prepareClaudeProfileDirectory,
  type ClaudeProfileDescriptor
} from '../claude-profile-paths'
import type { ClaudeProfileSetupReport } from '../setup/claude-profile-setup'
import { ClaudeProfileRouter, type ClaudeProfileRouterSettings } from './claude-profile-router'

vi.mock('@orca/process-host', () => ({ runProcess: vi.fn() }))
vi.mock('../../../codex-cli/command', () => ({ resolveClaudeCommand: () => '/unused-claude' }))
vi.mock('../../../startup/shell-environment/login-shell-environment', () => ({
  resolveLoginShellEnvironment: () => Promise.resolve({ CLAUDE_CONFIG_DIR: resolve('/shell/own') })
}))

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function signIn(stateDir: string, email: string): void {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(
    join(stateDir, '.claude.json'),
    JSON.stringify({ oauthAccount: { emailAddress: email } })
  )
}

function group(id: string, name: string, claudeAccountId?: string): ProjectGroup {
  return {
    id,
    name,
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...(claudeAccountId ? { claudeAccountId } : {})
  }
}

function repo(id: string, projectGroupId: string): Repo {
  return {
    id,
    path: `/work/${id}`,
    displayName: id,
    badgeColor: '#999',
    addedAt: 1,
    kind: 'git',
    projectGroupId
  }
}

/** Global selection `a`; group Work assigns `b`, group OSS assigns `c`; every account signed in. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'claude-router-assignment-'))
  roots.push(root)
  const userHome = join(root, 'personal')
  const dataRoot = join(root, 'data')
  mkdirSync(join(userHome, '.claude'), { recursive: true })
  const account = (id: string): ClaudeManagedAccount => ({
    id,
    email: `${id}@example.test`,
    authMethod: 'subscription-oauth',
    managedAuthPath: '/unused-legacy',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0
  })
  const settings: ClaudeProfileRouterSettings = {
    claudeManagedAccounts: [account('a'), account('b'), account('c')],
    activeClaudeManagedAccountId: 'a',
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: []
  }
  const catalog = {
    groups: [group('g-work', 'Work', 'b'), group('g-oss', 'OSS', 'c'), group('g-none', 'Misc')],
    repos: [repo('repo-work', 'g-work'), repo('repo-oss', 'g-oss'), repo('repo-none', 'g-none')]
  }
  const runSetup = async ({
    profile
  }: {
    profile: ClaudeProfileDescriptor
  }): Promise<ClaudeProfileSetupReport> => {
    prepareClaudeProfileDirectory(dataRoot, profile, userHome)()
    return { outcome: 'prepared', warnings: [], surfaces: {} }
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot,
    userHome,
    env: {},
    runSetup,
    refreshWaitMs: 500,
    assignment: (workspaceId) =>
      resolveClaudeAccountScopeForWorkspace({
        repos: catalog.repos,
        folderWorkspaces: [],
        groups: catalog.groups,
        knownAccountIds: hostClaudeAccountIds(settings.claudeManagedAccounts),
        workspaceId
      })
  })
  const home = (id: string) => join(dataRoot, 'claude-profiles', id, 'home')
  for (const id of ['a', 'b', 'c']) {
    signIn(home(id), `${id}@example.test`)
  }
  const scopePointer = (projectId: string) => join(dataRoot, 'claude-profiles', 'scopes', projectId)
  return { router, home, catalog, settings, dataRoot, scopePointer }
}

describe('ClaudeProfileRouter account assignments', () => {
  it('launches each group under its own account and anything unscoped under the global one', async () => {
    const f = fixture()
    const work = await f.router.prepareLaunch({ workspaceId: 'repo-work::/work/repo-work/x' })
    const oss = await f.router.prepareLaunch({ workspaceId: 'repo-oss::/work/repo-oss' })
    const unassigned = await f.router.prepareLaunch({ workspaceId: 'repo-none::/work/repo-none' })
    const unscoped = await f.router.prepareLaunch()

    expect(work.envPatch.CLAUDE_CONFIG_DIR).toBe(f.home('b'))
    expect(work.provenance).toBe('profile:b')
    expect(oss.envPatch.CLAUDE_CONFIG_DIR).toBe(f.home('c'))
    expect(oss.provenance).toBe('profile:c')
    expect(unassigned.envPatch.CLAUDE_CONFIG_DIR).toBe(f.home('a'))
    expect(unscoped.envPatch.CLAUDE_CONFIG_DIR).toBe(f.home('a'))
    expect(unscoped.provenance).toBe('profile:a')
  })

  it('refuses a launch whose assigned account is signed out, naming the account and the group', async () => {
    const f = fixture()
    rmSync(join(f.home('b'), '.claude.json'))
    await expect(f.router.prepareLaunch({ workspaceId: 'repo-work::/w' })).rejects.toMatchObject({
      name: 'ClaudeAssignedAccountSignedOutError',
      message:
        'Claude account b@example.test is assigned to group "Work" but is signed out. Sign in to it in Settings → Accounts, or change the assignment.'
    })
    // The global selection is untouched by another scope's refusal.
    await expect(f.router.prepareLaunch()).resolves.toMatchObject({ provenance: 'profile:a' })
  })

  it('gives a project pane its own pointer and rewrites it when the assignment changes', async () => {
    const f = fixture()
    const env = f.router.terminalEnv(undefined, { workspaceId: 'repo-work::/w' })
    expect(env.ORCA_CLAUDE_PROFILE_POINTER).toBe(f.scopePointer('repo-work'))
    expect(env.CLAUDE_CONFIG_DIR).toBe(f.home('b'))
    expect(readFileSync(f.scopePointer('repo-work'), 'utf8')).toBe(f.home('b'))

    f.catalog.groups[0].claudeAccountId = 'c'
    await f.router.publishScopePointers()
    expect(readFileSync(f.scopePointer('repo-work'), 'utf8')).toBe(f.home('c'))

    delete f.catalog.groups[0].claudeAccountId
    await f.router.publishScopePointers()
    expect(readFileSync(f.scopePointer('repo-work'), 'utf8')).toBe(f.home('a'))

    // A global switch reaches the unassigned project's open panes through the same file.
    f.settings.activeClaudeManagedAccountId = 'b'
    f.router.publish()
    await vi.waitFor(() =>
      expect(readFileSync(f.scopePointer('repo-work'), 'utf8')).toBe(f.home('b'))
    )
  })

  it('keeps the global pointer for a pane with no workspace', () => {
    const f = fixture()
    expect(f.router.terminalEnv().ORCA_CLAUDE_PROFILE_POINTER).toBe(
      join(f.dataRoot, 'claude-profiles', 'selected-host')
    )
  })

  it('moves an existing chat to the new account on its next launch after the assignment changes', async () => {
    const f = fixture()
    const scope = { workspaceId: 'repo-work::/w' }
    const first = await prepareClaudeLaunchAccount(f.router, {}, f.home('a'), scope)
    f.catalog.groups[0].claudeAccountId = 'c'
    const env: Record<string, string> = {}
    const second = await prepareClaudeLaunchAccount(f.router, env, f.home('a'), scope)

    expect(first).toEqual({ route: 'managed', accountId: 'b', home: f.home('b') })
    expect(second).toEqual({ route: 'managed', accountId: 'c', home: f.home('c') })
    expect(env.CLAUDE_CONFIG_DIR).toBe(f.home('c'))
  })
})

describe('claudeAccountScopeReader', () => {
  it('refuses to answer before the project catalog has loaded', () => {
    const read = claudeAccountScopeReader({
      hasHydratedProjectCatalog: () => false,
      getSettings: () => {
        throw new Error('unreachable')
      },
      getProjectGroups: () => [],
      getRepos: () => [],
      getFolderWorkspaces: () => []
    })
    expect(() => read('repo-work::/w')).toThrow(
      'Orca has not finished loading projects, so it cannot tell which Claude account this workspace uses. Try again in a moment.'
    )
  })
})
