import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import { resolveClaudeStructuredInvocation } from '../claude/claude-structured-launch-resolution'
import { resolveClaudeStructuredLaunchHome } from '../claude/claude-structured-launch-home'
import { resolveStructuredClaudeAccountHomePath } from '../runtime/structured-agent-account-home'
import {
  installClaudeProfileRouter,
  withClaudeProfileTerminalEnv
} from './claude-profile-installed-router'
import { ClaudeProfileRouter, type ClaudeProfileRouterSettings } from './claude-profile-router'
import { prepareLocalCommitMessageAgentEnv } from '../text-generation/commit-message-agent-environment'
import { claudeStructuredAuthPolicyForSettings } from './claude-structured-auth-policy'
import { applyClaudeEnvPatch } from './environment'
import { createProjectGroup } from '../../shared/project-groups'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import { CLAUDE_PROFILE_POINTER_ENV } from '../../shared/claude-profile-routing'
import { createClaudeBoundHomeOverride } from './claude-bound-home-route'
import type { ClaudeHomeBindingCatalogSource } from '../claude/claude-structured-account-home'

const roots: string[] = []
afterEach(() => {
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

/** Where every Orca-started Claude would run right now, read through each entry point. */
async function launchHomes(f: ReturnType<typeof coveredAccount>) {
  const chatEnv: Record<string, string> = {}
  return {
    terminal: (await f.router.prepareLaunch()).configDir,
    terminalEnv: withClaudeProfileTerminalEnv<Record<string, string>>({}, null, {
      runtime: 'host'
    }).CLAUDE_CONFIG_DIR,
    chat: await resolveClaudeStructuredLaunchHome(f.router, chatEnv, '/recorded'),
    chatEnv: chatEnv.CLAUDE_CONFIG_DIR,
    chatRecord: resolveStructuredClaudeAccountHomePath({
      launchEnv: {},
      wslDistro: null,
      getClaudeConfigDirectory: () => f.router.systemDefaultHome()
    }),
    chatAuth: claudeStructuredAuthPolicyForSettings(f.settings),
    usage: f.router.preparation().configDir,
    inactiveUsage: f.router.accountUsagePreparation('a').configDir
  }
}

describe('one router decision for every Claude launch', () => {
  it('sends every entry point to System default, then to the account once it signs in', async () => {
    const f = coveredAccount()
    expect(await launchHomes(f)).toEqual({
      terminal: f.systemHome,
      terminalEnv: undefined,
      chat: f.systemHome,
      chatEnv: undefined,
      chatRecord: f.systemHome,
      chatAuth: { account: 'system' },
      usage: f.systemHome,
      inactiveUsage: f.systemHome
    })
    signIn(f.accountHome, 'a@example.test')
    expect(await launchHomes(f)).toEqual({
      terminal: f.accountHome,
      terminalEnv: f.accountHome,
      chat: f.accountHome,
      chatEnv: f.accountHome,
      chatRecord: f.accountHome,
      // A shell proxy's key stays with its address on the account too.
      chatAuth: { account: 'managed' },
      usage: f.accountHome,
      inactiveUsage: f.accountHome
    })
  })

  // The shell function's half is in claude-shell-function.test.ts; WSL's in the WSL router test.
  it.each(['signed-in account', 'System default fallback'])(
    "keeps a shell proxy's key with its address on every launch: %s",
    async (scenario) => {
      const f = coveredAccount()
      if (scenario === 'signed-in account') {
        signIn(f.accountHome, 'a@example.test')
      }
      const home = scenario === 'signed-in account' ? f.accountHome : undefined
      const shell = {
        ANTHROPIC_BASE_URL: 'https://proxy.example.test',
        ANTHROPIC_API_KEY: 'proxy-key',
        ANTHROPIC_AUTH_TOKEN: 'proxy-token'
      }
      // A terminal applies the launch's patch to its own env and deletes nothing more.
      const terminal = applyClaudeEnvPatch(
        { PATH: '/usr/bin', ...shell },
        (await f.router.prepareLaunch()).envPatch
      )
      expect(terminal).toMatchObject(shell)
      expect(terminal.CLAUDE_CONFIG_DIR).toBe(home)
      const chat = await resolveClaudeStructuredInvocation({
        resolveCommand: () => 'claude',
        resolveInheritedEnv: async () => ({ PATH: '/usr/bin', ...shell }),
        resolveAuthPolicy: () => claudeStructuredAuthPolicyForSettings(f.settings)
      })
      expect(chat.env).toMatchObject(shell)
      const saved = Object.fromEntries(Object.keys(shell).map((key) => [key, process.env[key]]))
      Object.assign(process.env, shell)
      try {
        const commit = await prepareLocalCommitMessageAgentEnv('claude', {
          prepareForClaudeLaunch: () => f.router.prepareLaunch()
        })
        expect(commit).toMatchObject({ ok: true, env: shell })
        if (home) {
          expect(commit.ok && commit.env?.CLAUDE_CONFIG_DIR).toBe(home)
        }
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) {
            delete process.env[key]
          } else {
            process.env[key] = value
          }
        }
      }
    }
  )
})

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
