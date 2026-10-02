import { describe, expect, it } from 'vitest'
import {
  AGENT_STATUS_MAX_MONITORED_WORK,
  agentMonitoredWorkEqual,
  type AgentMonitoredWorkSnapshot
} from './agent-monitored-work'
import { normalizeAgentStatusPayload, pickParsedAgentStatusPayload } from './agent-status-types'

const SHELL: AgentMonitoredWorkSnapshot = {
  id: 'b727cb698',
  kind: 'command',
  label: 'watch for nonexistent file',
  detail: 'until [ -f /nonexistent ]; do sleep 5; done',
  firstObservedAt: 1000
}

function normalizedMonitoredWork(monitoredWork: unknown) {
  return normalizeAgentStatusPayload({
    state: 'working',
    workingMode: 'monitoring',
    monitoredWork
  })?.monitoredWork
}

describe('monitoredWork payload field', () => {
  it('keeps valid items through normalization and the status pick', () => {
    const cron: AgentMonitoredWorkSnapshot = {
      id: '31de6625',
      kind: 'cron',
      label: 'say hi',
      detail: '*/30 * * * * · recurring',
      firstObservedAt: 2000
    }
    const payload = normalizeAgentStatusPayload({
      state: 'working',
      workingMode: 'monitoring',
      monitoredWork: [SHELL, cron]
    })
    expect(payload?.monitoredWork).toEqual([SHELL, cron])
    expect(payload && pickParsedAgentStatusPayload(payload).monitoredWork).toEqual([SHELL, cron])
  })

  it('drops a malformed field without dropping the row', () => {
    const payload = normalizeAgentStatusPayload({
      state: 'working',
      prompt: 'p',
      monitoredWork: 'not a list'
    })
    expect(payload?.state).toBe('working')
    expect(payload?.monitoredWork).toBeUndefined()
  })

  it('drops malformed items and normalizes an empty result to absent', () => {
    expect(
      normalizedMonitoredWork([
        null,
        { ...SHELL, id: ' ' },
        { ...SHELL, id: 'x'.repeat(65) },
        { ...SHELL, firstObservedAt: Number.NaN },
        { ...SHELL, firstObservedAt: -1 }
      ])
    ).toBeUndefined()
    expect(normalizedMonitoredWork([])).toBeUndefined()
  })

  it('reads an unrecognized kind as unknown rather than dropping the item', () => {
    expect(normalizedMonitoredWork([{ ...SHELL, kind: 'future-kind' }])).toEqual([
      { ...SHELL, kind: 'unknown' }
    ])
  })

  it('keeps label and detail single-line and bounded', () => {
    const [item] =
      normalizedMonitoredWork([{ ...SHELL, label: 'a\nb', detail: `x${'y'.repeat(400)}` }]) ?? []
    expect(item?.label).toBe('a b')
    expect(item?.detail?.length).toBeLessThanOrEqual(160)
  })

  it('caps the list', () => {
    const many = Array.from({ length: AGENT_STATUS_MAX_MONITORED_WORK + 5 }, (_, index) => ({
      ...SHELL,
      id: `shell-${index}`
    }))
    expect(normalizedMonitoredWork(many)).toHaveLength(AGENT_STATUS_MAX_MONITORED_WORK)
  })

  it('compares lists structurally', () => {
    expect(agentMonitoredWorkEqual([SHELL], [{ ...SHELL }])).toBe(true)
    expect(agentMonitoredWorkEqual(undefined, undefined)).toBe(true)
    expect(agentMonitoredWorkEqual([SHELL], undefined)).toBe(false)
    expect(agentMonitoredWorkEqual([SHELL], [{ ...SHELL, detail: 'other' }])).toBe(false)
    expect(agentMonitoredWorkEqual([SHELL], [{ ...SHELL, firstObservedAt: 1 }])).toBe(false)
  })
})
