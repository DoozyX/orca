import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDraftPasteReadyScanner,
  resolvePasteReadySignal
} from '../../shared/draft-paste-ready-scanner'
import type { TuiAgent } from '../../shared/tui-agent'
import { TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'
import type { RuntimeTerminalWait } from '../../shared/runtime-terminal-contracts'
import { GROK_STARTUP_PTY_TRACE } from '../../shared/__fixtures__/grok-startup-pty-trace'
import type { GrokStartupTraceChunk } from '../../shared/__fixtures__/grok-startup-pty-trace'
import { GROK_INLINE_STARTUP_PTY_TRACE } from '../../shared/__fixtures__/grok-inline-startup-pty-trace'
import {
  readRuntimeFixture,
  readTimedRuntimeFixture,
  replayTranscript
} from './agent-transcript-replay-test-harness'
import {
  getLaunchedAgentReadinessLane,
  waitForLaunchedAgentComposer,
  waitForWorkerAgentReadyRebinding,
  workerStartReadsComposerMarker,
  type LaunchedAgentReadinessLane,
  type LaunchedAgentReadinessRuntime,
  type WorkerAgentReadinessRebindRuntime
} from './launched-agent-composer-readiness'
import { waitForWorktreeStartupDraft } from './runtime-worktree-startup-readiness'

// Why a full Record: adding a TuiAgent fails to compile here until someone decides whether its
// worker start waits for a captured input-box marker, and a row that gains or loses evidence
// shows up in review.
const EXPECTED_LANES: Record<TuiAgent, LaunchedAgentReadinessLane> = {
  zcode: 'composer-marker',
  opencode: 'composer-marker',
  opencode2: 'composer-marker',
  // mimo-code shares OpenCode's signal by parity only; no mimo boot has been recorded.
  'mimo-code': 'tui-idle',
  // Grok's inline mode never fires its marker; its marker is not proven at the box for every mode.
  grok: 'tui-idle',
  dsh: 'tui-idle',
  codex: 'tui-idle',
  cursor: 'tui-idle',
  pi: 'tui-idle',
  omp: 'tui-idle',
  droid: 'tui-idle',
  hermes: 'tui-idle',
  devin: 'tui-idle',
  claude: 'tui-idle',
  'claude-agent-teams': 'tui-idle',
  openclaude: 'tui-idle',
  gemini: 'tui-idle',
  antigravity: 'tui-idle',
  aider: 'tui-idle',
  openclaw: 'tui-idle',
  copilot: 'tui-idle',
  muse: 'tui-idle',
  qoder: 'tui-idle',
  'qoder-cn': 'tui-idle',
  codebuddy: 'tui-idle',
  autohand: 'tui-idle',
  ante: 'tui-idle',
  trae: 'tui-idle',
  'prime-agent': 'tui-idle',
  goose: 'tui-idle',
  amp: 'tui-idle',
  kilo: 'tui-idle',
  kiro: 'tui-idle',
  crush: 'tui-idle',
  aug: 'tui-idle',
  cline: 'tui-idle',
  codebuff: 'tui-idle',
  freebuff: 'tui-idle',
  'command-code': 'tui-idle',
  continue: 'tui-idle',
  kimi: 'tui-idle',
  'mistral-vibe': 'tui-idle',
  'qwen-code': 'tui-idle',
  rovo: 'tui-idle',
  jcode: 'tui-idle'
}

const FIXTURES = join(__dirname, '__fixtures__')
const OPENCODE_PLACEHOLDER = 'Ask anything'
const AGENT_ROW = /\u00b7 \S/
const BOX_BOTTOM_LEFT = '\u2579'

const CITED_CAPTURES = Object.entries(TUI_AGENT_CONFIG).flatMap(([agent, row]) =>
  (row.composerReadyCaptures ?? []).map((capture) => [agent, capture] as const)
)

function isTuiAgent(agent: string): agent is TuiAgent {
  return agent in TUI_AGENT_CONFIG
}

function readSignal(agent: string) {
  if (!isTuiAgent(agent)) {
    throw new Error(`${agent} is not a TuiAgent`)
  }
  if (!TUI_AGENT_CONFIG[agent].draftPasteReadySignal) {
    throw new Error(`${agent} cites composer-ready captures but has no draftPasteReadySignal`)
  }
  // Worker start always presses Enter after its paste.
  return resolvePasteReadySignal(TUI_AGENT_CONFIG[agent], true)
}

/** Index of the first read the scanner reports ready on, or -1. */
function firstReadyRead(agent: string, reads: readonly string[]): number {
  const scanner = createDraftPasteReadyScanner(readSignal(agent))
  return reads.findIndex((read) => scanner.observe(read).ready)
}

function readReads(capture: string): string[] {
  if (existsSync(join(FIXTURES, `${capture}.timing.json`))) {
    return readTimedRuntimeFixture(capture).chunks
  }
  const data = readRuntimeFixture(capture)
  const reads: string[] = []
  for (let offset = 0; offset < data.length; offset += 4096) {
    reads.push(data.slice(offset, offset + 4096))
  }
  return reads
}

describe('which lane a freshly launched worker waits on', () => {
  it.each(Object.entries(EXPECTED_LANES))('%s: %s', (agent, lane) => {
    if (!isTuiAgent(agent)) {
      throw new Error(`${agent} is not a TuiAgent`)
    }
    expect(getLaunchedAgentReadinessLane(agent)).toBe(lane)
  })
})

describe('which idle-lane worker starts also answer on their composer marker', () => {
  // Their only rest signal is their bare name, which a launch holds to quiet output; Grok's logo
  // animates for ten seconds after its composer glyph. Gemini's title needs corroboration: absent.
  it('is exactly the bare-name agents whose composer draws a marker', () => {
    expect(
      Object.keys(EXPECTED_LANES)
        .filter(isTuiAgent)
        .filter(
          (agent) =>
            getLaunchedAgentReadinessLane(agent) === 'tui-idle' &&
            workerStartReadsComposerMarker(agent)
        )
        .sort()
    ).toEqual(['dsh', 'grok', 'mimo-code'])
  })
})

describe('every capture a row cites proves its input-box marker', () => {
  it('cites at least the rows worker start moved', () => {
    expect(CITED_CAPTURES.map(([agent]) => agent)).toEqual(
      expect.arrayContaining(['zcode', 'opencode', 'opencode2'])
    )
  })

  it.each(CITED_CAPTURES)('%s: %s is committed with its sidecar', (_agent, capture) => {
    expect(existsSync(join(FIXTURES, `${capture}.txt`))).toBe(true)
    const meta: { platform?: string; command?: string[]; note?: string } = JSON.parse(
      readFileSync(join(FIXTURES, `${capture}.meta.json`), 'utf8')
    )
    expect(meta.platform).toEqual(expect.any(String))
    expect(meta.command?.length).toBeGreaterThan(0)
    expect(meta.note).toEqual(expect.any(String))
  })

  it.each(CITED_CAPTURES)("%s: the row's current signal fires on %s", (agent, capture) => {
    expect(firstReadyRead(agent, readReads(capture))).toBeGreaterThanOrEqual(0)
  })

  it.each(CITED_CAPTURES.filter(([agent]) => readSignal(agent) === 'opencode-agent-row'))(
    '%s: the first ready read in %s is no earlier than the agent row under the box',
    async (agent, capture) => {
      const meta: { cols: number; rows: number } = JSON.parse(
        readFileSync(join(FIXTURES, `${capture}.meta.json`), 'utf8')
      )
      const { chunks } = readTimedRuntimeFixture(capture)
      let boxRead = -1
      let rowRead = -1
      let read = 0
      for await (const frame of replayTranscript(chunks, meta.cols, meta.rows)) {
        // A brief pasted before the row replaces the placeholder in the box.
        const box = frame.screenLines.findIndex(
          (line) => line.includes(OPENCODE_PLACEHOLDER) || line.includes('[Pasted ~')
        )
        if (box !== -1 && boxRead === -1) {
          boxRead = read
        }
        // The row inside the box's last line reads `<agent> · <model>`; a read can paint the
        // separator and model before the agent.
        const corner = frame.screenLines.findIndex((line) => line.includes(BOX_BOTTOM_LEFT))
        if (box !== -1 && corner > box && AGENT_ROW.test(frame.screenLines[corner - 1])) {
          rowRead = read
          break
        }
        read += 1
      }
      expect(boxRead).toBeGreaterThanOrEqual(0)
      expect(rowRead).toBeGreaterThanOrEqual(boxRead)
      // OpenCode 1 paints the row just before the box's cursor in one frame; 2 paints it later.
      const cursorRead = createDraftPasteReadyScanner('render-cursor-after-bracketed-paste')
      const boxCursorRead = chunks.findIndex((chunk) => cursorRead.observe(chunk).ready)
      expect(firstReadyRead(agent, chunks)).toBe(Math.max(rowRead, boxCursorRead))
    }
  )
})

const READY: RuntimeTerminalWait = {
  handle: 'term-1',
  condition: 'tui-idle',
  satisfied: true,
  status: 'running',
  exitCode: null
}

/** The runtime's composer wait over a replayed PTY stream, with its defaults. */
function replayRuntime() {
  let listener = (_data: string): void => {}
  const waitForFreshWorkerComposer = vi.fn(
    async (
      handle: string,
      agent: TuiAgent,
      timeoutMs: number,
      { requireComposerMarker = true }: { requireComposerMarker?: boolean } = {}
    ): Promise<RuntimeTerminalWait> => {
      const ptyId = await waitForWorktreeStartupDraft(
        {
          getPtyId: () => 'pty-1',
          getForegroundProcess: async () => agent,
          subscribeToData: (_ptyId, onData) => {
            listener = onData
            return () => {
              listener = () => {}
            }
          },
          readRecentOutput: () => undefined,
          write: vi.fn()
        },
        handle,
        agent,
        { timeoutMs, requireComposerMarker }
      )
      if (!ptyId) {
        throw new Error('timeout')
      }
      return READY
    }
  )
  /** The `tui-idle` fallback: pending until a test settles it. */
  let settleIdle = (_wait: RuntimeTerminalWait): void => {}
  const waitForTerminal = vi.fn(
    (): Promise<RuntimeTerminalWait> =>
      new Promise((resolve) => {
        settleIdle = resolve
      })
  )
  const runtime: LaunchedAgentReadinessRuntime = {
    waitForTerminal,
    waitForFreshWorkerComposer
  }
  const play = async (trace: GrokStartupTraceChunk[]): Promise<void> => {
    let now = 0
    for (const chunk of trace) {
      await vi.advanceTimersByTimeAsync(chunk.t - now)
      now = chunk.t
      listener(chunk.data ?? 'x'.repeat(chunk.bytes ?? 0))
    }
  }
  return {
    runtime,
    waitForTerminal,
    play,
    feed: (data: string) => listener(data),
    settleIdle: (wait: RuntimeTerminalWait) => settleIdle(wait)
  }
}

describe('launched grok composer readiness', () => {
  afterEach(() => vi.useRealTimers())

  it('opens on the composer frame in the default full-screen mode', async () => {
    vi.useFakeTimers()
    const h = replayRuntime()
    const ready = waitForLaunchedAgentComposer(h.runtime, 'term-1', 'grok', 60_000)
    await h.play(GROK_STARTUP_PTY_TRACE)
    await expect(ready).resolves.toEqual(READY)
  })

  it('still opens in inline mode, which never switches to the alternate screen', async () => {
    // `grok --no-alt-screen` / `screen_mode = "minimal"` paints its `❯` without the anchor the
    // marker needs, so the quiet window after bracketed paste is its only readiness.
    vi.useFakeTimers()
    const h = replayRuntime()
    const ready = waitForLaunchedAgentComposer(h.runtime, 'term-1', 'grok', 60_000)
    const settled = vi.fn()
    void ready.then(settled, settled)
    await h.play(GROK_INLINE_STARTUP_PTY_TRACE)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(settled).toHaveBeenCalledWith(READY)
  })

  it('keeps ZCode on its composer marker alone', async () => {
    vi.useFakeTimers()
    const h = replayRuntime()
    const ready = waitForLaunchedAgentComposer(h.runtime, 'term-1', 'zcode', 1_000)
    void ready.catch(() => {})
    expect(h.runtime.waitForFreshWorkerComposer).toHaveBeenCalledWith('term-1', 'zcode', 1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(ready).rejects.toThrow('timeout')
  })
})

describe('launched composer readiness for agents the idle evidence can also read', () => {
  afterEach(() => vi.useRealTimers())

  it('pastes on the quiet window after bracketed paste, as the desktop did, without the idle evidence', async () => {
    vi.useFakeTimers()
    const h = replayRuntime()
    const ready = waitForLaunchedAgentComposer(h.runtime, 'term-1', 'claude', 60_000)
    const settled = vi.fn()
    void ready.then(settled, settled)
    h.feed('\x1b[?2004h\x1b[?25l welcome to claude code \x1b[?25h')

    await vi.advanceTimersByTimeAsync(1_400)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(settled).toHaveBeenCalledWith(READY)
    expect(h.waitForTerminal).not.toHaveBeenCalled()
  })

  it('checks the idle evidence only once the desktop paste’s budget ran out, where it pasted blind', async () => {
    vi.useFakeTimers()
    const h = replayRuntime()
    const ready = waitForLaunchedAgentComposer(h.runtime, 'term-1', 'claude', 60_000)
    // Output, but bracketed paste never turns on, so the composer signal cannot fire.
    h.feed('\x1b[?25l welcome to claude code \x1b[?25h')

    await vi.advanceTimersByTimeAsync(7_900)
    expect(h.waitForTerminal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(h.waitForTerminal).toHaveBeenCalledWith('term-1', {
      condition: 'tui-idle',
      timeoutMs: 52_000,
      launchReadiness: true
    })
    h.settleIdle(READY)

    await expect(ready).resolves.toEqual(READY)
  })
})

// #29: a graph reload can remint a live pane's handle while worker-start waits on it.
describe('the worker readiness wait across a reminted handle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const READY: RuntimeTerminalWait = {
    handle: 'term_reminted',
    condition: 'tui-idle',
    satisfied: true,
    status: 'running',
    exitCode: null
  }

  function rebindRuntime(options: { remintedTo: string | null; incarnation: string | null }) {
    const runtime: WorkerAgentReadinessRebindRuntime = {
      waitForTerminal: vi.fn(),
      waitForFreshWorkerComposer: vi.fn(),
      getTerminalHandleForPaneKey: vi.fn((paneKey: string) =>
        paneKey === 'pane_worker' ? options.remintedTo : null
      ),
      getTerminalProcessIncarnation: vi.fn((handle: string) =>
        handle === options.remintedTo ? options.incarnation : null
      )
    }
    return runtime
  }

  const args = {
    agent: 'codex',
    reusesTerminal: false,
    timeoutMs: 60_000,
    paneKey: 'pane_worker',
    processIncarnation: 'inc_1'
  } as const

  it('waits once more on the same process under its new handle, for what is left', async () => {
    vi.useFakeTimers()
    const runtime = rebindRuntime({ remintedTo: 'term_reminted', incarnation: 'inc_1' })
    vi.mocked(runtime.waitForTerminal)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('terminal_handle_stale')), 1_500)
          )
      )
      .mockResolvedValueOnce(READY)

    const pending = waitForWorkerAgentReadyRebinding(runtime, 'term_worker', args)
    await vi.advanceTimersByTimeAsync(1_500)

    await expect(pending).resolves.toEqual({ wait: READY, handle: 'term_reminted' })
    expect(runtime.waitForTerminal).toHaveBeenCalledTimes(2)
    expect(runtime.waitForTerminal).toHaveBeenLastCalledWith(
      'term_reminted',
      expect.objectContaining({ condition: 'tui-idle', timeoutMs: 58_500 })
    )
  })

  it.each([
    ['another process', { remintedTo: 'term_reminted', incarnation: 'inc_2' }],
    ['no handle', { remintedTo: null, incarnation: null }]
  ] as const)('fails as before when the pane now holds %s', async (_label, pane) => {
    const runtime = rebindRuntime(pane)
    vi.mocked(runtime.waitForTerminal).mockRejectedValue(new Error('terminal_handle_stale'))

    await expect(waitForWorkerAgentReadyRebinding(runtime, 'term_worker', args)).rejects.toThrow(
      'terminal_handle_stale'
    )
    expect(runtime.waitForTerminal).toHaveBeenCalledTimes(1)
  })

  it('re-resolves at most once', async () => {
    const runtime = rebindRuntime({ remintedTo: 'term_reminted', incarnation: 'inc_1' })
    vi.mocked(runtime.waitForTerminal).mockRejectedValue(new Error('terminal_handle_stale'))

    await expect(waitForWorkerAgentReadyRebinding(runtime, 'term_worker', args)).rejects.toThrow(
      'terminal_handle_stale'
    )
    expect(runtime.waitForTerminal).toHaveBeenCalledTimes(2)
  })

  it('never re-resolves a wait that failed for another reason', async () => {
    const runtime = rebindRuntime({ remintedTo: 'term_reminted', incarnation: 'inc_1' })
    vi.mocked(runtime.waitForTerminal).mockRejectedValue(new Error('timeout'))

    await expect(waitForWorkerAgentReadyRebinding(runtime, 'term_worker', args)).rejects.toThrow(
      'timeout'
    )
    expect(runtime.getTerminalHandleForPaneKey).not.toHaveBeenCalled()
  })
})
