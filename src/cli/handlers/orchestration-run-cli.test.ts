import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()
const getTerminalHandleMock = vi.hoisted(() => vi.fn())

vi.mock('../format', () => ({ printResult: vi.fn() }))
vi.mock('../selectors', () => ({ getTerminalHandle: getTerminalHandleMock }))

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ORCHESTRATION_HANDLERS } from './orchestration'
import { printResult } from '../format'
import { RuntimeClient } from '../runtime-client'

describe('lightweight Run CLI handlers', () => {
  beforeEach(() => {
    callMock.mockReset()
    getTerminalHandleMock.mockReset()
    process.env.ORCA_TERMINAL_HANDLE = 'term_coord'
  })

  it('creates a Run with the resolved coordinator terminal', async () => {
    callMock.mockResolvedValue({
      result: { run: { id: 'run_1', objective: 'Coordinate work', consumer_generation: 1 } }
    })
    await ORCHESTRATION_HANDLERS['orchestration run-create']({
      flags: new Map<string, string | boolean>([
        ['objective', 'Coordinate work'],
        ['json', true]
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)
    expect(callMock).toHaveBeenCalledWith('orchestration.runCreate', {
      objective: 'Coordinate work',
      from: 'term_coord'
    })
  })

  it('reuses the same explicit binding path for run-use and run-current', async () => {
    callMock
      .mockResolvedValueOnce({ result: { run: { id: 'run_1', objective: 'Work' } } })
      .mockResolvedValueOnce({ result: { run: { id: 'run_1', objective: 'Work' } } })
    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map([
        ['id', 'run_1'],
        ['from', 'term_coord']
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)
    await ORCHESTRATION_HANDLERS['orchestration run-current']({
      flags: new Map([['from', 'term_coord']]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)
    expect(callMock).toHaveBeenNthCalledWith(1, 'orchestration.runUse', {
      id: 'run_1',
      from: 'term_coord'
    })
    expect(callMock).toHaveBeenNthCalledWith(2, 'orchestration.runCurrent', {
      from: 'term_coord'
    })
  })

  it('passes Run pagination flags to the runtime', async () => {
    callMock.mockResolvedValue({
      result: { runs: [], nextCursor: null }
    })

    await ORCHESTRATION_HANDLERS['orchestration run-list']({
      flags: new Map([
        ['limit', '25'],
        ['cursor', 'next-page']
      ]),
      client: { call: callMock },
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runList', {
      limit: 25,
      cursor: 'next-page'
    })
  })

  it('opts into bounded Run pagination by default', async () => {
    callMock.mockResolvedValue({ result: { runs: [], nextCursor: null } })

    await ORCHESTRATION_HANDLERS['orchestration run-list']({
      flags: new Map(),
      client: { call: callMock },
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runList', {
      limit: 100,
      cursor: undefined
    })
  })

  it('passes explicit legacy takeover only when requested', async () => {
    callMock.mockResolvedValue({
      result: { run: { id: 'run_adopted', objective: 'Recovered work' } }
    })
    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map<string, string | boolean>([
        ['id', 'run_adopted'],
        ['from', 'term_current'],
        ['takeover-legacy', true]
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runUse', {
      id: 'run_adopted',
      from: 'term_current',
      takeoverLegacy: true
    })
  })
})

describe('orchestration reset CLI handler', () => {
  beforeEach(() => {
    callMock.mockReset().mockResolvedValue({ result: { reset: 'all' } })
  })
  const invoke = (flags: Map<string, string | boolean>) =>
    ORCHESTRATION_HANDLERS['orchestration reset']({
      flags,
      client: { call: callMock },
      json: true
    } as never)

  it('rejects a bare reset before calling the runtime', async () => {
    await expect(invoke(new Map())).rejects.toMatchObject({
      code: 'invalid_argument',
      message: 'Choose exactly one reset scope: --all, --tasks, or --messages.'
    })
    expect(callMock).not.toHaveBeenCalled()
  })

  it('sends only the tasks scope for --tasks', async () => {
    await invoke(new Map([['tasks', true]]))
    expect(callMock).toHaveBeenCalledWith('orchestration.reset', {
      all: undefined,
      tasks: true,
      messages: undefined
    })
  })

  it('sends only the all scope for --all', async () => {
    await invoke(new Map([['all', true]]))
    expect(callMock).toHaveBeenCalledWith('orchestration.reset', {
      all: true,
      tasks: undefined,
      messages: undefined
    })
  })

  it.each([
    new Map<string, string | boolean>([
      ['tasks', true],
      ['messages', true]
    ]),
    new Map<string, string | boolean>([
      ['all', true],
      ['tasks', true]
    ])
  ])('rejects multiple reset scopes before calling the runtime', async (flags) => {
    await expect(invoke(flags)).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(callMock).not.toHaveBeenCalled()
  })
})

// #30: a guessed caller bound an idle shell as a Run's coordinator; the live coordinator was an
// orphaned agent terminal that the cwd guess cannot see.
describe('coordinator verbs that bind a Run or a worker preamble never guess the caller', () => {
  const NO_RUN = { result: { run: { id: 'run_1', objective: 'x', consumer_generation: 1 } } }
  const client = new RuntimeClient(join(tmpdir(), 'orca-run-cli-test'), 1_000, null, null)

  beforeEach(() => {
    vi.spyOn(client, 'call').mockImplementation((...args) => callMock(...args))
    vi.mocked(printResult).mockReset()
    getTerminalHandleMock.mockReset().mockResolvedValue('term_idle_shell')
    callMock.mockReset().mockImplementation(async (method: string, params: unknown) => {
      const terminal = typeof params === 'object' && params && 'terminal' in params
      if (method === 'terminal.resolveIdentity' && terminal) {
        return { result: { identity: { live: params.terminal === 'term_live_coord' } } }
      }
      if (method === 'terminal.resolvePane') {
        return { result: { terminal: { handle: 'term_live_coord' } } }
      }
      return NO_RUN
    })
    for (const name of [
      'ORCA_AGENT_SESSION_ID',
      'ORCA_TERMINAL_HANDLE',
      'ORCA_PANE_KEY',
      'ORCA_STRUCTURED_SESSION'
    ]) {
      vi.stubEnv(name, undefined)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(client.call).mockRestore()
  })

  const invoke = (command: string, flags: readonly (readonly [string, string | boolean])[]) =>
    ORCHESTRATION_HANDLERS[`orchestration ${command}`]({
      flags: new Map<string, string | boolean>(flags),
      client,
      cwd: '/tmp/repo',
      json: false
    })
  const calledMethods = () => callMock.mock.calls.map(([method]) => method)

  it.each([
    ['run-create', [['objective', 'x']], 'orchestration.runCreate'],
    ['run-use', [['id', 'run_1']], 'orchestration.runUse'],
    [
      'dispatch',
      [
        ['task', 't'],
        ['to', 'term_w']
      ],
      'orchestration.dispatch'
    ],
    [
      'worker-start',
      [
        ['task', 't'],
        ['agent', 'codex']
      ],
      'orchestration.workerStart'
    ]
  ] as const)(
    '%s with no --from, terminal handle, pane key or session refuses instead of guessing',
    async (command, flags, method) => {
      await expect(invoke(command, flags)).rejects.toMatchObject({
        code: 'no_active_sender_terminal',
        message: expect.stringContaining('--from')
      })
      expect(getTerminalHandleMock).not.toHaveBeenCalled()
      expect(calledMethods()).not.toContain(method)
    }
  )

  it('run-create binds the live coordinator named by ORCA_TERMINAL_HANDLE and says so', async () => {
    vi.stubEnv('ORCA_TERMINAL_HANDLE', 'term_live_coord')

    await invoke('run-create', [['objective', 'x']])

    expect(callMock).toHaveBeenCalledWith('orchestration.runCreate', {
      objective: 'x',
      from: 'term_live_coord'
    })
    expect(getTerminalHandleMock).not.toHaveBeenCalled()
    const format = vi.mocked(printResult).mock.calls[0]?.[2]
    expect(format?.(NO_RUN.result)).toContain('term_live_coord')
  })

  it('run-create binds the terminal named by --from', async () => {
    await invoke('run-create', [
      ['objective', 'x'],
      ['from', 'term_live_coord']
    ])

    expect(callMock).toHaveBeenCalledWith('orchestration.runCreate', {
      objective: 'x',
      from: 'term_live_coord'
    })
  })

  it('run-create follows a stale ORCA_TERMINAL_HANDLE to its pane, never to a guess', async () => {
    vi.stubEnv('ORCA_TERMINAL_HANDLE', 'term_stale')
    vi.stubEnv('ORCA_PANE_KEY', 'pane_coord')

    await invoke('run-create', [['objective', 'x']])

    expect(callMock).toHaveBeenCalledWith('orchestration.runCreate', {
      objective: 'x',
      from: 'term_live_coord'
    })
    expect(callMock).toHaveBeenCalledWith('terminal.resolvePane', { paneKey: 'pane_coord' })
    expect(getTerminalHandleMock).not.toHaveBeenCalled()
  })

  it('run-create refuses a stale ORCA_TERMINAL_HANDLE with no pane to follow', async () => {
    vi.stubEnv('ORCA_TERMINAL_HANDLE', 'term_stale')

    await expect(invoke('run-create', [['objective', 'x']])).rejects.toMatchObject({
      code: 'no_active_sender_terminal'
    })
    expect(calledMethods()).not.toContain('orchestration.runCreate')
    expect(getTerminalHandleMock).not.toHaveBeenCalled()
  })

  it('run-create from an agent session lets the host bind the caller, as before', async () => {
    vi.stubEnv('ORCA_AGENT_SESSION_ID', 'sess_coord')

    await invoke('run-create', [['objective', 'x']])

    expect(calledMethods()).toEqual(['orchestration.runCreate'])
    expect(callMock.mock.calls[0]?.[1]).toEqual({ objective: 'x', from: undefined })
    expect(getTerminalHandleMock).not.toHaveBeenCalled()
  })

  it('run-current still reads the guessed terminal, which binds nothing', async () => {
    await invoke('run-current', [])

    expect(getTerminalHandleMock).toHaveBeenCalledTimes(1)
    expect(callMock).toHaveBeenCalledWith('orchestration.runCurrent', { from: 'term_idle_shell' })
  })
})
