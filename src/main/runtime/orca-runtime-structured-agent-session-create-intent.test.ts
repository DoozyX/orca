import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const applyAgentWorkspaceTrust = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('../agent-workspace-trust', () => ({ applyAgentWorkspaceTrust }))

import { OrcaRuntimeService } from './orca-runtime'
import type { AssertClaudeBoundHomeUsable } from '../claude/claude-bound-home-refusal'

/** The real Store always answers these; a stub that omits one refuses by name instead of
 *  silently reading as "nothing is bound". */
const EMPTY_BINDING_CATALOG = {
  hasHydratedProjectCatalog: () => true,
  getProjectGroups: () => [],
  getRepos: () => [],
  getFolderWorkspaces: () => []
}
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../shared/constants'
import { attachFingerprintFields } from '../native-chat/agent-session-wire/structured-agent-session-attach'

beforeEach(() => {
  applyAgentWorkspaceTrust.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function createCodexIntentRuntime(
  settings: Record<string, unknown>,
  workspaceId = 'workspace-1',
  workspacePath = '/repos/workspace-1'
) {
  const prepareCodexStructuredLaunch = vi.fn(() => '/accounts/selected/home')
  const runtime = new OrcaRuntimeService(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: create intent only reads getSettings from the store.
    { getSettings: () => ({ agentDefaultEnv: { codex: {} }, ...settings }) } as never,
    undefined,
    { prepareCodexStructuredLaunch }
  )
  vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
    supported: true
  })
  Object.assign(runtime, {
    resolveStructuredAgentSessionLocation: vi.fn(async () => ({
      executionHostId: 'local',
      wslDistro: null,
      workspaceId,
      workspaceKind: 'git-worktree' as const
    })),
    resolveRuntimeFileTarget: vi.fn(async () => ({ worktree: { path: workspacePath } }))
  })
  const createIntent = () =>
    runtime.resolveStructuredAgentSessionCreateIntent({
      envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
      worktree: `id:${workspaceId}`,
      agent: 'codex'
    })
  return { prepareCodexStructuredLaunch, createIntent }
}

describe('structured Codex folder trust', () => {
  it('takes a floating chat directory from the host-resolved workspace', async () => {
    const { createIntent } = createCodexIntentRuntime(
      {},
      FLOATING_TERMINAL_WORKTREE_ID,
      '/host/floating-folder'
    )

    const intent = await createIntent()

    expect(intent.hostLaunchDirectory).toBe('/host/floating-folder')
    expect(applyAgentWorkspaceTrust).toHaveBeenCalledWith(
      'codex',
      '/host/floating-folder',
      expect.any(Object)
    )
    expect(attachFingerprintFields(intent)).not.toHaveProperty('hostLaunchDirectory')
  })

  it('pre-trusts the chat folder before launch preparation, as a Codex terminal launch does', async () => {
    const { prepareCodexStructuredLaunch, createIntent } = createCodexIntentRuntime({})

    await createIntent()

    expect(applyAgentWorkspaceTrust).toHaveBeenCalledWith('codex', '/repos/workspace-1', {
      env: expect.any(Object),
      claudeAuth: null,
      wslDistro: null,
      connectionId: null
    })
    expect(applyAgentWorkspaceTrust.mock.invocationCallOrder[0]).toBeLessThan(
      prepareCodexStructuredLaunch.mock.invocationCallOrder[0]
    )
  })

  it('writes nothing with the setting off, and still prepares the launch', async () => {
    const { prepareCodexStructuredLaunch, createIntent } = createCodexIntentRuntime({
      agentWorkspaceTrustEnabled: false
    })

    await createIntent()

    expect(applyAgentWorkspaceTrust).not.toHaveBeenCalled()
    expect(prepareCodexStructuredLaunch).toHaveBeenCalledTimes(1)
  })
})

describe('structured agent-session create intent', () => {
  it('pins the selected Codex launch home after normal launch preparation', async () => {
    const prepareCodexStructuredLaunch = vi.fn(() => '/accounts/selected/home')
    const runtime = new OrcaRuntimeService(
      {
        getSettings: () => ({
          agentDefaultEnv: { codex: { CODEX_HOME: '/configured/home' } },
          nativeChatSessionOptions: {
            codex: {
              model: 'gpt-5.6-sol',
              valuesByModel: {
                'gpt-5.6-sol': { effort: 'medium', fastMode: true, personality: 'concise' }
              }
            }
          }
        })
      } as never,
      undefined,
      { prepareCodexStructuredLaunch }
    )
    vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: true
    })
    const internal = runtime as unknown as {
      resolveStructuredAgentSessionLocation: (selector: string) => Promise<{
        executionHostId: string
        wslDistro: null
        workspaceId: string
        workspaceKind: 'git-worktree'
      }>
      resolveRuntimeFileTarget: (selector: string) => Promise<{
        worktree: { path: string }
      }>
    }
    internal.resolveStructuredAgentSessionLocation = vi.fn(async () => ({
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'workspace-1',
      workspaceKind: 'git-worktree' as const
    }))
    internal.resolveRuntimeFileTarget = vi.fn(async () => ({
      worktree: { path: '/repos/workspace-1' }
    }))

    const intent = await runtime.resolveStructuredAgentSessionCreateIntent({
      envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
      worktree: 'id:workspace-1',
      agent: 'codex'
    })

    expect(prepareCodexStructuredLaunch).toHaveBeenCalledWith({
      launchEnv: expect.objectContaining({ CODEX_HOME: '/configured/home' })
    })
    expect(intent.accountHome).toEqual({
      variable: 'CODEX_HOME',
      path: '/accounts/selected/home'
    })
    expect(intent.options).toEqual({
      model: 'gpt-5.6-sol',
      effort: 'medium',
      fastMode: 'true',
      permissionMode: 'ask'
    })
  })

  it('resolves the record-less catalog account home read-only, never through launch preparation', async () => {
    const prepareCodexStructuredLaunch = vi.fn(() => '/accounts/selected/home')
    const resolveCodexStructuredLaunchHome = vi.fn(() => '/accounts/selected/home')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the account-home read only consumes getSettings from the store.
    const store = {
      getSettings: () => ({
        agentDefaultEnv: { codex: { CODEX_HOME: '/configured/home' } }
      })
    } as never
    const runtime = new OrcaRuntimeService(store, undefined, {
      prepareCodexStructuredLaunch,
      resolveCodexStructuredLaunchHome
    })

    const accountHome = await runtime.resolveStructuredAgentAccountHome('codex')

    // A read must not run launch preparation: no home sync, no session bridge,
    // no cleared account selection — the read-only sibling answers instead.
    expect(prepareCodexStructuredLaunch).not.toHaveBeenCalled()
    expect(resolveCodexStructuredLaunchHome).toHaveBeenCalledWith({
      launchEnv: expect.objectContaining({ CODEX_HOME: '/configured/home' })
    })
    expect(accountHome).toEqual({ variable: 'CODEX_HOME', path: '/accounts/selected/home' })
  })

  it('pins the configured Claude launch home without Codex launch preparation', async () => {
    const prepareCodexStructuredLaunch = vi.fn()
    const runtime = new OrcaRuntimeService(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the create-intent path reads only the store accessors stubbed here.
      {
        ...EMPTY_BINDING_CATALOG,
        getSettings: () => ({
          agentDefaultEnv: {
            claude: { CLAUDE_CONFIG_DIR: '/configured/claude-home' }
          },
          nativeChatSessionOptions: {
            claude: {
              model: 'opus',
              valuesByModel: { opus: { effort: 'high', fastMode: true } }
            }
          }
        })
      } as never,
      undefined,
      { prepareCodexStructuredLaunch }
    )
    vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: true
    })
    const internal = runtime as unknown as {
      resolveStructuredAgentSessionLocation: (selector: string) => Promise<{
        executionHostId: string
        wslDistro: null
        workspaceId: string
        workspaceKind: 'git-worktree'
      }>
      resolveRuntimeFileTarget: (selector: string) => Promise<{
        worktree: { path: string }
      }>
    }
    internal.resolveStructuredAgentSessionLocation = vi.fn(async () => ({
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'workspace-1',
      workspaceKind: 'git-worktree' as const
    }))
    internal.resolveRuntimeFileTarget = vi.fn(async () => ({
      worktree: { path: '/repos/workspace-1' }
    }))

    const intent = await runtime.resolveStructuredAgentSessionCreateIntent({
      envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
      worktree: 'id:workspace-1',
      agent: 'claude'
    })

    expect(prepareCodexStructuredLaunch).not.toHaveBeenCalled()
    // Claude was never pre-trusted for a structured chat.
    expect(applyAgentWorkspaceTrust).not.toHaveBeenCalled()
    expect(intent.accountHome).toEqual({
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/configured/claude-home'
    })
    expect(intent.options).toEqual({
      model: 'opus',
      effort: 'high',
      fastMode: 'true',
      permissionMode: 'ask'
    })
    // createSupport reports this same seed, so a paired client's picker shows what create runs.
    expect(runtime.structuredAgentSessionLaunchSeedOptions('claude')).toEqual(intent.options)
  })

  it('uses the managed Claude launch home before falling back to ~/.claude', async () => {
    const prepareCodexStructuredLaunch = vi.fn()
    const getRuntimeConfigDir = vi.fn(() => '/accounts/managed/claude-home')
    const runtime = new OrcaRuntimeService(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the create-intent path reads only the store accessors stubbed here.
      {
        ...EMPTY_BINDING_CATALOG,
        getSettings: () => ({
          agentDefaultEnv: { claude: {} }
        })
      } as never,
      undefined,
      { prepareCodexStructuredLaunch }
    )
    runtime.setAccountServices({
      claudeAccounts: { getRuntimeConfigDir } as never,
      codexAccounts: {} as never,
      rateLimits: {} as never
    })
    vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: true
    })
    const internal = runtime as unknown as {
      resolveStructuredAgentSessionLocation: (selector: string) => Promise<{
        executionHostId: string
        wslDistro: null
        workspaceId: string
        workspaceKind: 'git-worktree'
      }>
      resolveRuntimeFileTarget: (selector: string) => Promise<{
        worktree: { path: string }
      }>
    }
    internal.resolveStructuredAgentSessionLocation = vi.fn(async () => ({
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'workspace-1',
      workspaceKind: 'git-worktree' as const
    }))
    internal.resolveRuntimeFileTarget = vi.fn(async () => ({
      worktree: { path: '/repos/workspace-1' }
    }))

    const intent = await runtime.resolveStructuredAgentSessionCreateIntent({
      envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
      worktree: 'id:workspace-1',
      agent: 'claude'
    })

    expect(getRuntimeConfigDir).toHaveBeenCalledTimes(1)
    expect(intent.accountHome).toEqual({
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/accounts/managed/claude-home'
    })
  })
})

describe('project-group Claude home binding', () => {
  const GROUP = {
    id: 'group-1',
    name: 'Bound',
    parentGroupId: null,
    claudeConfigDir: '/bound/claude-home'
  }
  const REPO = { id: 'repo-1', path: '/repos/repo-1', projectGroupId: 'group-1' }

  function boundRuntime(
    overrides: {
      groups?: unknown[]
      repos?: unknown[]
      agentDefaultEnv?: Record<string, Record<string, string>>
      assertBoundHomeUsable?: AssertClaudeBoundHomeUsable
      omitCatalogAccessor?:
        | 'hasHydratedProjectCatalog'
        | 'getProjectGroups'
        | 'getRepos'
        | 'getFolderWorkspaces'
      hydrated?: boolean
      /** Leaves the real create-support probe in place, which is itself under test. */
      realCreateSupport?: boolean
      settings?: Record<string, unknown>
    } = {}
  ) {
    const store: Record<string, unknown> = {
      getSettings: () => ({
        agentDefaultEnv: overrides.agentDefaultEnv ?? { claude: {} },
        ...overrides.settings
      }),
      hasHydratedProjectCatalog: () => overrides.hydrated ?? true,
      getRepos: () => overrides.repos ?? [REPO],
      getFolderWorkspaces: () => [],
      getProjectGroups: () => overrides.groups ?? [GROUP]
    }
    if (overrides.omitCatalogAccessor) {
      delete store[overrides.omitCatalogAccessor]
    }
    const runtime = new OrcaRuntimeService(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the create-intent path reads only these four store accessors.
      store as never,
      undefined,
      {
        prepareCodexStructuredLaunch: vi.fn(),
        ...(overrides.assertBoundHomeUsable
          ? { assertClaudeBoundHomeUsable: overrides.assertBoundHomeUsable }
          : {})
      }
    )
    if (!overrides.realCreateSupport) {
      vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
        supported: true
      })
    }
    // The two protected seams overridden below are the ones this suite already drives.
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: protected test seam.
    const internal = runtime as unknown as Record<string, unknown>
    internal.resolveStructuredAgentSessionLocation = vi.fn(async () => ({
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'repo-1::/repos/workspace-1',
      workspaceKind: 'git-worktree' as const
    }))
    internal.resolveRuntimeFileTarget = vi.fn(async () => ({
      worktree: { path: '/repos/workspace-1' }
    }))
    return runtime
  }

  const createInput = {
    envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
    worktree: 'id:repo-1::/repos/workspace-1',
    agent: 'claude' as const
  }

  it('pins the bound group home and marks the record with the group', async () => {
    const assertClaudeBoundHomeUsable = vi.fn(async () => {})
    const intent = await boundRuntime({ assertBoundHomeUsable: assertClaudeBoundHomeUsable }) //
      .resolveStructuredAgentSessionCreateIntent(createInput)

    expect(intent.accountHome).toEqual({
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/bound/claude-home',
      binding: { kind: 'project-group', groupId: 'group-1' }
    })
    expect(assertClaudeBoundHomeUsable).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: { configDir: '/bound/claude-home', groupId: 'group-1' },
        location: expect.objectContaining({ executionHostId: 'local', wslDistro: null })
      })
    )
  })

  it('hands the launch env to the usability check so a conflict can refuse', async () => {
    await expect(
      boundRuntime({
        agentDefaultEnv: { claude: { CLAUDE_CONFIG_DIR: '/elsewhere/claude-home' } },
        assertBoundHomeUsable: async ({ launchEnv }) => {
          if (launchEnv.CLAUDE_CONFIG_DIR !== '/bound/claude-home') {
            throw new Error('claude_bound_home_env_conflict')
          }
        }
      }).resolveStructuredAgentSessionCreateIntent(createInput)
    ).rejects.toThrow('claude_bound_home_env_conflict')
  })

  it('takes the unbound path when the workspace group binds nothing', async () => {
    const assertClaudeBoundHomeUsable = vi.fn(async () => {})
    const intent = await boundRuntime({
      groups: [{ ...GROUP, claudeConfigDir: null }],
      agentDefaultEnv: { claude: { CLAUDE_CONFIG_DIR: '/configured/claude-home' } },
      assertBoundHomeUsable: assertClaudeBoundHomeUsable
    }).resolveStructuredAgentSessionCreateIntent(createInput)

    expect(assertClaudeBoundHomeUsable).not.toHaveBeenCalled()
    expect(intent.accountHome).toEqual({
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/configured/claude-home'
    })
  })

  it('leaves a workspace in no group entirely unbound', async () => {
    const intent = await boundRuntime({
      repos: [{ ...REPO, projectGroupId: null }],
      agentDefaultEnv: { claude: { CLAUDE_CONFIG_DIR: '/configured/claude-home' } }
    }).resolveStructuredAgentSessionCreateIntent(createInput)

    expect(intent.accountHome).toEqual({
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/configured/claude-home'
    })
  })

  // A catalog this host cannot read is not evidence of "no binding": answering "unbound" would
  // launch the shared home for a group that bound another one.
  it.each([
    'hasHydratedProjectCatalog',
    'getProjectGroups',
    'getRepos',
    'getFolderWorkspaces'
  ] as const)('refuses by name when the store cannot answer %s', async (accessor) => {
    await expect(
      boundRuntime({ omitCatalogAccessor: accessor }).resolveStructuredAgentSessionCreateIntent(
        createInput
      )
    ).rejects.toThrow('claude_home_binding_catalog_unavailable')
  })

  it('refuses to resume a conversation that does not live under the bound home', async () => {
    await expect(
      boundRuntime({
        assertBoundHomeUsable: async () => {}
      }).resolveStructuredAgentSessionCreateIntent({
        ...createInput,
        resumeFrom: { providerSessionId: 'conversation-in-the-shared-home' }
      })
    ).rejects.toThrow('agent_session_identity_required')
  })

  // An empty catalog from a store that has not loaded its profile state is indistinguishable from
  // "nothing is bound", and answering that launches the shared home for a group that bound another.
  it('refuses by name when the store has not hydrated its project catalog', async () => {
    await expect(
      boundRuntime({ hydrated: false }).resolveStructuredAgentSessionCreateIntent(createInput)
    ).rejects.toThrow('claude_home_binding_catalog_unhydrated')
  })

  // Binding a group to the home the CLI would find on its own pins nothing, so it must not leave
  // the record wearing a marker that switches off the gates protecting that very home.
  it("drops the marker for a binding that names the CLI's own default home", async () => {
    const assertClaudeBoundHomeUsable = vi.fn(async () => {})
    const sharedHome = join(homedir(), '.claude')
    const intent = await boundRuntime({
      groups: [{ ...GROUP, claudeConfigDir: sharedHome }],
      assertBoundHomeUsable: assertClaudeBoundHomeUsable
    }).resolveStructuredAgentSessionCreateIntent(createInput)

    expect(intent.accountHome).toEqual({ variable: 'CLAUDE_CONFIG_DIR', path: sharedHome })
    expect(assertClaudeBoundHomeUsable).not.toHaveBeenCalled()
  })

  it('never binds a Codex session', async () => {
    const intent = await boundRuntime({
      agentDefaultEnv: { codex: { CODEX_HOME: '/configured/codex-home' } }
    }).resolveStructuredAgentSessionCreateIntent({ ...createInput, agent: 'codex' })

    expect(intent.accountHome).toMatchObject({ variable: 'CODEX_HOME' })
    expect(intent.accountHome).not.toHaveProperty('binding')
  })
})

describe('adopting a conversation recorded outside Orca', () => {
  it('resolves OMP history with the configured launch environment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-omp-create-intent-'))
    try {
      const accountHome = join(root, 'account', 'agent')
      const ambientData = join(root, 'ambient-data')
      const launchData = join(root, 'launch-data')
      const workspaceCwd = join(root, 'workspace')
      const sessionId = '0198c2a4-7d1e-7c3a-9a4b-1f2e3d4c5b6a'
      const sessionFile = join(
        launchData,
        'omp',
        'profiles',
        'configured',
        'sessions',
        '-workspace',
        `2026-10-12T00-00-00-000Z_${sessionId}.jsonl`
      )
      await mkdir(join(ambientData, 'omp', 'profiles', 'ambient'), { recursive: true })
      await mkdir(join(launchData, 'omp', 'profiles', 'configured'), { recursive: true })
      await mkdir(join(root, 'account'), { recursive: true })
      await mkdir(workspaceCwd, { recursive: true })
      await mkdir(dirname(sessionFile), { recursive: true })
      await writeFile(
        sessionFile,
        `${JSON.stringify({ type: 'session', id: sessionId, cwd: workspaceCwd })}\n`
      )
      vi.stubEnv('XDG_DATA_HOME', ambientData)
      vi.stubEnv('OMP_PROFILE', 'ambient')
      const runtime = new OrcaRuntimeService(
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: create intent only reads getSettings from the store.
        {
          getSettings: () => ({
            agentDefaultEnv: {
              omp: {
                PI_CODING_AGENT_DIR: accountHome,
                OMP_CODING_AGENT_DIR: '',
                HOME: root,
                XDG_DATA_HOME: launchData,
                OMP_PROFILE: 'configured'
              }
            }
          })
        } as never
      )
      vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
        supported: true
      })
      Object.assign(runtime, {
        resolveStructuredAgentSessionLocation: vi.fn(async () => ({
          executionHostId: 'local',
          wslDistro: null,
          workspaceId: 'workspace-1',
          workspaceKind: 'git-worktree' as const
        })),
        resolveRuntimeFileTarget: vi.fn(async () => ({
          worktree: { path: workspaceCwd }
        }))
      })

      const intent = await runtime.resolveStructuredAgentSessionCreateIntent({
        envelope: { sessionId: 'chat-1', clientOperationId: 'operation-1' },
        worktree: 'id:workspace-1',
        agent: 'omp',
        resumeFrom: { providerSessionId: sessionId }
      })

      expect(intent.adopt?.transcriptPath).toBe(sessionFile)
      expect(intent.accountHome).toEqual({ variable: 'PI_CODING_AGENT_DIR', path: accountHome })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses an agent registered with no transcript importer before any adoption work', async () => {
    const runtime = new OrcaRuntimeService(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: create intent only reads getSettings from the store.
      { getSettings: () => ({ agentDefaultEnv: {} }) } as never
    )
    vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
      supported: true
    })
    const resolveStructuredAgentSessionLocation = vi.fn()
    Object.assign(runtime, { resolveStructuredAgentSessionLocation })

    await expect(
      runtime.resolveStructuredAgentSessionCreateIntent({
        envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
        worktree: 'id:workspace-1',
        // Every registered agent adopts; an unregistered one has no importer.
        agent: 'hermes',
        resumeFrom: { providerSessionId: 'provider-1' }
      })
    ).rejects.toMatchObject({
      refusal: {
        code: 'structured_agent_session_unsupported',
        details: { reason: 'hostUnsupported' }
      }
    })
    expect(resolveStructuredAgentSessionLocation).not.toHaveBeenCalled()
  })

  it('adopts the original Pi file into a folder workspace and refuses another folder', async () => {
    const accountHome = await mkdtemp(join(tmpdir(), 'orca-pi-adopt-intent-'))
    vi.stubEnv('PI_CODING_AGENT_DIR', accountHome)
    try {
      const file = join(
        accountHome,
        'sessions',
        '--repos-workspace-1--',
        '2026-10-12T00-00-00-000Z_0198c2a4-7d1e-7c3a-9a4b-1f2e3d4c5b6a.jsonl'
      )
      await mkdir(dirname(file), { recursive: true })
      await writeFile(
        file,
        `${JSON.stringify({ type: 'session', id: '0198c2a4-7d1e-7c3a-9a4b-1f2e3d4c5b6a', cwd: '/repos/workspace-1' })}\n`
      )
      const runtime = new OrcaRuntimeService(
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: create intent only reads getSettings from the store.
        {
          getSettings: () => ({ agentDefaultEnv: { pi: { PI_CODING_AGENT_DIR: accountHome } } })
        } as never
      )
      vi.spyOn(runtime, 'getStructuredAgentSessionCreateSupport').mockResolvedValue({
        supported: true
      })
      let workspaceDirectory = '/repos/workspace-1'
      Object.assign(runtime, {
        resolveStructuredAgentSessionLocation: vi.fn(async () => ({
          executionHostId: 'local',
          wslDistro: null,
          workspaceId: 'workspace-1',
          workspaceKind: 'folder' as const
        })),
        resolveRuntimeFileTarget: vi.fn(async () => ({ worktree: { path: workspaceDirectory } }))
      })

      const intent = await runtime.resolveStructuredAgentSessionCreateIntent({
        envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
        worktree: 'id:workspace-1',
        agent: 'pi',
        resumeFrom: { providerSessionId: '0198c2a4-7d1e-7c3a-9a4b-1f2e3d4c5b6a' }
      })

      expect(intent.accountHome).toEqual({ variable: 'PI_CODING_AGENT_DIR', path: accountHome })
      expect(intent.adopt).toEqual({
        providerHandle: { transport: 'jsonl-rpc', agent: 'pi', nativeId: file },
        transcriptPath: file
      })

      workspaceDirectory = '/different-folder'
      await expect(
        runtime.resolveStructuredAgentSessionCreateIntent({
          envelope: { sessionId: 'session-2', clientOperationId: 'operation-2' },
          worktree: 'id:workspace-1',
          agent: 'pi',
          resumeFrom: { providerSessionId: '0198c2a4-7d1e-7c3a-9a4b-1f2e3d4c5b6a' }
        })
      ).rejects.toMatchObject({ refusal: { code: 'agent_session_identity_required' } })
    } finally {
      vi.unstubAllEnvs()
      await rm(accountHome, { recursive: true, force: true })
    }
  })
})
