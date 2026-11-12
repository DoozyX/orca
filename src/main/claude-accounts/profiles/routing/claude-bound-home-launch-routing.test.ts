import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import { resolveClaudeStructuredLaunchHome } from '../../../claude/structured/launch/claude-structured-launch-home'
import {
  installClaudeProfileRouter,
  withClaudeProfileTerminalEnv
} from './claude-profile-installed-router'
import { ClaudeProfileRouter, type ClaudeProfileRouterSettings } from './claude-profile-router'
import { prepareLocalCommitMessageAgentEnv } from '../../../text-generation/commit-message-agent-environment'
import { createProjectGroup } from '../../../../shared/project-groups'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import { CLAUDE_PROFILE_POINTER_ENV } from '../../../../shared/claude-profile-routing'
import { createClaudeBoundHomeOverride } from './claude-bound-home-route'
import type { ClaudeHomeBindingCatalogSource } from '../../../claude/claude-structured-account-home'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  installClaudeProfileRouter(undefined)
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function signIn(stateDir: string, email: string): void {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(
    join(stateDir, '.claude.json'),
    JSON.stringify({ oauthAccount: { emailAddress: email } })
  )
}

/** Account a is selected and set up but signed in only in System default. */
function coveredAccount(catalog: ClaudeHomeBindingCatalogSource = null) {
  const root = mkdtempSync(join(tmpdir(), 'claude-launch-routing-'))
  roots.push(root)
  const userHome = join(root, 'personal')
  const dataRoot = join(root, 'data')
  const account: ClaudeManagedAccount = {
    id: 'a',
    email: 'a@example.test',
    authMethod: 'subscription-oauth',
    managedAuthPath: '/unused-legacy',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0
  }
  const settings: ClaudeProfileRouterSettings = {
    claudeManagedAccounts: [account],
    activeClaudeManagedAccountId: 'a',
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: []
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot,
    userHome,
    env: {},
    runSetup: async () => ({ outcome: 'prepared', warnings: [], surfaces: {} }),
    // Usability is covered by claude-bound-home-refusal.test.ts; this census is about routing.
    boundHome: createClaudeBoundHomeOverride(catalog, async () => {})
  })
  const accountHome = router.accountHome('a')
  mkdirSync(accountHome, { recursive: true })
  writeFileSync(join(accountHome, '..', 'profile.json'), '{}')
  signIn(userHome, 'a@example.test')
  installClaudeProfileRouter(
    router,
    createClaudeBoundHomeOverride(catalog, async () => {})
  )
  return { router, settings, accountHome, systemHome: join(userHome, '.claude') }
}

/** A folder workspace whose project group binds its own Claude home: the user's, never Orca's. */
function boundGroupCatalog(boundDir: string) {
  const group = {
    ...createProjectGroup({ name: 'Bound', createdFrom: 'manual', tabOrder: 0 }),
    claudeConfigDir: boundDir
  }
  const folder: FolderWorkspace = {
    id: 'bound',
    projectGroupId: group.id,
    name: 'bound',
    folderPath: boundDir,
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    createdAt: 0,
    updatedAt: 0
  }
  const catalog: ClaudeHomeBindingCatalogSource = {
    hasHydratedProjectCatalog: () => true,
    getProjectGroups: () => [group],
    getRepos: () => [],
    getFolderWorkspaces: () => [folder]
  }
  return { catalog, groupId: group.id }
}

describe("a project group's bound Claude home", () => {
  it('overrides the selected account on every entry point, and Orca writes nothing there', async () => {
    // A test run from an Orca terminal inherits the real user's pointer.
    vi.stubEnv(CLAUDE_PROFILE_POINTER_ENV, undefined)
    const boundDir = mkdtempSync(join(tmpdir(), 'claude-bound-home-'))
    roots.push(boundDir)
    writeFileSync(join(boundDir, '.credentials.json'), '{}')
    const { catalog, groupId } = boundGroupCatalog(boundDir)
    const f = coveredAccount(catalog)
    signIn(f.accountHome, 'a@example.test')
    const scope = { workspaceId: 'folder:bound' }
    const before = readdirSync(boundDir)

    const chatEnv: Record<string, string> = {}
    const terminalEnv = withClaudeProfileTerminalEnv<Record<string, string>>(
      {},
      null,
      { runtime: 'host' },
      scope
    )
    const commit = await prepareLocalCommitMessageAgentEnv(
      'claude',
      { prepareForClaudeLaunch: (_target, launchScope) => f.router.prepareLaunch(launchScope) },
      undefined,
      scope
    )
    expect({
      terminal: (await f.router.prepareLaunch(scope)).configDir,
      terminalEnv: terminalEnv.CLAUDE_CONFIG_DIR,
      // No pointer, so the pane's `claude` function runs it as-is.
      terminalPointer: terminalEnv[CLAUDE_PROFILE_POINTER_ENV],
      chat: await resolveClaudeStructuredLaunchHome(f.router, chatEnv, boundDir, {
        boundHome: { configDir: boundDir, groupId }
      }),
      chatEnv: chatEnv.CLAUDE_CONFIG_DIR,
      commit: commit.ok ? commit.env?.CLAUDE_CONFIG_DIR : null,
      commitPointer: commit.ok ? commit.env?.[CLAUDE_PROFILE_POINTER_ENV] : null
    }).toEqual({
      terminal: boundDir,
      terminalEnv: boundDir,
      terminalPointer: undefined,
      chat: boundDir,
      chatEnv: boundDir,
      commit: boundDir,
      commitPointer: undefined
    })
    expect(readdirSync(boundDir)).toEqual(before)
    // Outside the group, and over SSH, the selection still decides.
    expect((await f.router.prepareLaunch({ workspaceId: 'folder:other' })).configDir).toBe(
      f.accountHome
    )
    expect(withClaudeProfileTerminalEnv({}, 'ssh-1', { runtime: 'host' }, scope)).toEqual({})
  })
})
