import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPaneCacheState,
  createHookListenerState,
  movePaneCacheState,
  type HookListenerState
} from './agent-hook-listener/listener-state'
import { normalizeHookPayload } from './agent-hook-listener'
import { makePaneKey } from './stable-pane-id'

const PANE = makePaneKey('tab-source', '11111111-1111-4111-8111-111111111111')
const TARGET_PANE = makePaneKey('tab-target', '22222222-2222-4222-8222-222222222222')

type CaptureRecord = { payload: Record<string, unknown> }

// Claude 2.1.287: a Monitor-tool watch and a session cron, both live at Stop.
function capturedStop(): Record<string, unknown> {
  const records = readFileSync(
    join(__dirname, '__fixtures__', 'claude-monitored-work-hooks.jsonl'),
    'utf8'
  )
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line): CaptureRecord => JSON.parse(line))
  const stop = records.find((record) => record.payload.hook_event_name === 'Stop')
  if (!stop) {
    throw new Error('capture has no Stop record')
  }
  return stop.payload
}

function emit(state: HookListenerState, payload: Record<string, unknown>, paneKey = PANE) {
  return normalizeHookPayload(state, 'claude', { paneKey, payload }, 'production')?.payload
}

const SHELL_ITEM = {
  id: 'b727cb698',
  kind: 'command',
  label: 'watch for nonexistent file',
  detail: 'until [ -f /nonexistent-orca-capture-2 ]; do sleep 5; done; echo found'
}
const CRON_ITEM = {
  id: '31de6625',
  kind: 'cron',
  label: 'say hi',
  detail: '*/30 * * * * · recurring'
}

describe('Claude monitored work', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes the captured shell and cron as monitored work on Stop', () => {
    const state = createHookListenerState()
    const payload = emit(state, capturedStop())

    expect(payload).toMatchObject({ state: 'working', workingMode: 'monitoring' })
    expect(payload?.monitoredWork).toEqual([
      { ...SHELL_ITEM, firstObservedAt: 10_000 },
      { ...CRON_ITEM, firstObservedAt: 10_000 }
    ])
  })

  it('keeps first-observed time across inventories that still list the item', () => {
    const state = createHookListenerState()
    emit(state, capturedStop())
    vi.setSystemTime(70_000)
    const later = emit(state, capturedStop())

    expect(later?.monitoredWork?.map((item) => item.firstObservedAt)).toEqual([10_000, 10_000])
  })

  it('carries the list on events without an inventory and clears it on an empty one', () => {
    const state = createHookListenerState()
    emit(state, capturedStop())
    const mid = emit(state, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' }
    })
    expect(mid?.monitoredWork).toHaveLength(2)

    const cleared = emit(state, {
      hook_event_name: 'Stop',
      background_tasks: [],
      session_crons: []
    })
    expect(cleared?.monitoredWork).toBeUndefined()
    expect(cleared?.state).toBe('done')
  })

  it('lists only live non-agent tasks', () => {
    const state = createHookListenerState()
    const payload = emit(state, {
      hook_event_name: 'Stop',
      background_tasks: [
        { id: 'agent-1', type: 'subagent', status: 'running', agent_type: 'reviewer' },
        { id: 'shell-done', type: 'shell', status: 'completed', command: 'true' },
        { id: 'wf-1', type: 'local_workflow', status: 'running', description: 'flow' },
        { id: 'odd-1', type: 'future_thing', status: 'running' }
      ],
      session_crons: []
    })

    expect(payload?.monitoredWork).toEqual([
      { id: 'wf-1', kind: 'workflow', label: 'flow', firstObservedAt: 10_000 },
      { id: 'odd-1', kind: 'unknown', firstObservedAt: 10_000 }
    ])
  })

  it('labels a one-shot cron as once', () => {
    const state = createHookListenerState()
    const payload = emit(state, {
      hook_event_name: 'Stop',
      background_tasks: [],
      session_crons: [{ id: 'c1', schedule: '0 9 * * *', recurring: false, prompt: 'remind me' }]
    })

    expect(payload?.monitoredWork).toEqual([
      {
        id: 'c1',
        kind: 'cron',
        label: 'remind me',
        detail: '0 9 * * * · once',
        firstObservedAt: 10_000
      }
    ])
  })

  it('ignores an inventory attributed to a subagent', () => {
    const state = createHookListenerState()
    const payload = emit(state, {
      ...capturedStop(),
      hook_event_name: 'SubagentStop',
      agent_id: 'child-1'
    })

    expect(payload?.monitoredWork).toBeUndefined()
  })

  it('clears on a new session and on pane cleanup, and follows a pane-key move', () => {
    const fresh = createHookListenerState()
    emit(fresh, capturedStop())
    const started = emit(fresh, { hook_event_name: 'SessionStart', source: 'startup' })
    expect(started?.monitoredWork).toBeUndefined()

    const cleaned = createHookListenerState()
    emit(cleaned, capturedStop())
    clearPaneCacheState(cleaned, PANE)
    expect(
      emit(cleaned, { hook_event_name: 'UserPromptSubmit', prompt: 'x' })?.monitoredWork
    ).toBeUndefined()

    const moved = createHookListenerState()
    emit(moved, capturedStop())
    movePaneCacheState(moved, PANE, TARGET_PANE)
    expect(
      emit(moved, { hook_event_name: 'PreToolUse', tool_name: 'Bash' }, TARGET_PANE)?.monitoredWork
    ).toHaveLength(2)
  })

  it('drops crons but keeps shells when another session takes the pane', () => {
    const state = createHookListenerState()
    emit(state, { ...capturedStop(), session_id: 'session-a' })
    const payload = emit(state, {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'next',
      session_id: 'session-b'
    })

    expect(payload?.monitoredWork?.map((item) => item.kind)).toEqual(['command'])
  })
})
