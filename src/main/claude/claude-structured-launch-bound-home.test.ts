import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { createClaudeStructuredLaunchResolver } from '../runtime/structured-agent-launch-composition.test-support'
import type { ClaudeStructuredLaunchPartDeps } from './claude-structured-launch-resolution'
import { ClaudeBoundHomeRefusalError } from './claude-bound-home-refusal'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'

const SESSION_ID = 'orca-session-1'
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only the identity's session id.
const IDENTITY = { sessionId: SESSION_ID } as Parameters<
  ReturnType<typeof createClaudeStructuredLaunchResolver>
>[0]['identity']

function record(overrides: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only the fields set here.
  return {
    sessionId: SESSION_ID,
    provider: 'claude',
    location: {
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      wslDistro: null,
      workspaceId: 'workspace-1',
      workspaceKind: 'folder'
    },
    accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: '/home/work/.claude' },
    providerHandleChain: [],
    ...overrides
  } as AgentSessionRecord
}

function identityAt(leafUuid: string | null): typeof IDENTITY {
  return { ...IDENTITY, providerHandle: claudeProviderHandle('provider-current', leafUuid) }
}

function resolverFor(
  value: AgentSessionRecord | null,
  resolveEnv?: () => Record<string, string>,
  extraDeps: Partial<ClaudeStructuredLaunchPartDeps> = {}
) {
  return createClaudeStructuredLaunchResolver({
    store: { getRecord: () => value, pinLaunchDirectory: vi.fn() },
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => '/usr/local/bin/claude',
    resolveAuthPolicy: () => ({ account: 'system' }),
    // A no-op by default so a test that is not about the bound home does not need a real directory.
    assertBoundHomeUsable: async () => {},
    hasTranscript: async () => true,
    resolveLaunchArgs: () => value?.launchArgs ?? [],
    ...(resolveEnv ? { resolveEnv } : {}),
    ...extraDeps
  })
}

const RESUMABLE = record({
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only each link's handle, so the link's other fields stay unset.
  providerHandleChain: [
    { handle: claudeProviderHandle('provider-current', 'leaf-current') }
  ] as AgentSessionRecord['providerHandleChain']
})

function boundRecord(binding: boolean): AgentSessionRecord {
  return record({
    providerHandleChain: RESUMABLE.providerHandleChain,
    accountHome: {
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/bound/claude-home',
      ...(binding ? { binding: { kind: 'project-group', groupId: 'group-1' } } : {})
    }
  })
}

describe('claude structured launch resolution: project-group bound home', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('bound home re-verification at acquisition', () => {
    it('re-proves the bound directory on every acquisition, not only at create', async () => {
      const assertBoundHomeUsable = vi.fn(async () => {})
      vi.stubEnv('ORCA_TEST_AMBIENT_MARKER', 'ambient')
      const resolve = resolverFor(boundRecord(true), () => ({ SOME_OVERLAY: '1' }), {
        assertBoundHomeUsable
      })

      await expect(resolve({ identity: identityAt('leaf-current') })).resolves.toBeDefined()
      // The env the child actually receives, not the overlay alone: a conflicting ambient
      // CLAUDE_CONFIG_DIR reaches the CLI, so the check that refuses one has to see it too.
      expect(assertBoundHomeUsable).toHaveBeenCalledWith({
        binding: { configDir: '/bound/claude-home', groupId: 'group-1' },
        location: { executionHostId: LOCAL_EXECUTION_HOST_ID, wslDistro: null },
        launchEnv: expect.objectContaining({
          SOME_OVERLAY: '1',
          ORCA_TEST_AMBIENT_MARKER: 'ambient'
        })
      })
    })

    it('refuses the acquisition when the bound directory no longer serves it', async () => {
      const resolve = resolverFor(boundRecord(true), undefined, {
        assertBoundHomeUsable: async () => {
          throw new Error('claude_bound_home_signed_out')
        }
      })

      await expect(resolve({ identity: identityAt('leaf-current') })).rejects.toThrow(
        'claude_bound_home_signed_out'
      )
    })

    it('launches in the bound directory and resumes the transcript there', async () => {
      const launch = await resolverFor(boundRecord(true))({ identity: identityAt('leaf-current') })

      expect(launch.claudeConfigDir).toBe('/bound/claude-home')
      expect(launch.env?.CLAUDE_CONFIG_DIR).toBe('/bound/claude-home')
      expect(launch.resumesTranscript).toBe(true)
    })

    it('leaves an unbound record untouched by the bound-home check', async () => {
      const assertBoundHomeUsable = vi.fn(async () => {})
      await expect(
        resolverFor(boundRecord(false), undefined, { assertBoundHomeUsable })({
          identity: identityAt('leaf-current')
        })
      ).resolves.toBeDefined()
      expect(assertBoundHomeUsable).not.toHaveBeenCalled()
    })
  })
  describe("a binding naming the CLI's own default home", () => {
    // Binding a group to `~/.claude` pins nothing — the config-dir patch emits nothing because the
    // path is already what the CLI finds. The marker must therefore not take the launch off the
    // account routing that covers exactly that home.
    function sharedHomeRecord(): AgentSessionRecord {
      return record({
        providerHandleChain: RESUMABLE.providerHandleChain,
        accountHome: {
          variable: 'CLAUDE_CONFIG_DIR',
          path: join(homedir(), '.claude'),
          binding: { kind: 'project-group', groupId: 'group-1' }
        }
      })
    }

    it('runs no bound-home re-proof, exactly as an unbound session does not', async () => {
      const assertBoundHomeUsable = vi.fn(async () => {})
      await expect(
        resolverFor(sharedHomeRecord(), undefined, { assertBoundHomeUsable })({
          identity: identityAt('leaf-current')
        })
      ).resolves.toMatchObject({ claudeConfigDir: join(homedir(), '.claude') })
      expect(assertBoundHomeUsable).not.toHaveBeenCalled()
    })
  })

  describe('a group bound after the chat was created', () => {
    function resolveWithGroupBinding(
      configDir: string | null,
      accountHome: AgentSessionRecord['accountHome'] = {
        variable: 'CLAUDE_CONFIG_DIR',
        path: '/old/claude-home'
      }
    ) {
      return resolverFor(
        record({ providerHandleChain: RESUMABLE.providerHandleChain, accountHome }),
        undefined,
        {
          readClaudeHomeBinding: () => (configDir ? { configDir, groupId: 'group-1' } : null)
        }
      )({ identity: identityAt('leaf-current') })
    }

    // The account home is pinned at create and a resume rebuilds it verbatim, so a binding added
    // afterwards never reaches this chat. Say so rather than billing another organisation.
    it('refuses by name instead of silently keeping the old home', async () => {
      const error = await resolveWithGroupBinding('/bound/claude-home').then(
        () => null,
        (thrown: unknown) => (thrown instanceof ClaudeBoundHomeRefusalError ? thrown : null)
      )

      expect(error?.refusal).toEqual({
        code: 'claude_bound_home_predates_binding',
        groupId: 'group-1',
        configDir: '/bound/claude-home',
        accountHomePath: '/old/claude-home'
      })
      // Both homes are named, so the user can see which chat is on which account.
      expect(error?.message).toContain('/old/claude-home')
      expect(error?.message).toContain('/bound/claude-home')
    })

    it("says nothing when the chat already runs under the group's home", async () => {
      await expect(
        resolveWithGroupBinding('/bound/claude-home', {
          variable: 'CLAUDE_CONFIG_DIR',
          path: '/bound/claude-home',
          binding: { kind: 'project-group', groupId: 'group-1' }
        })
      ).resolves.toBeDefined()
    })

    it('says nothing when the group binds nothing', async () => {
      await expect(resolveWithGroupBinding(null)).resolves.toBeDefined()
    })
  })
})
