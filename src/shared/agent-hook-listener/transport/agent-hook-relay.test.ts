import { describe, expect, it } from 'vitest'
import {
  createShedMonitoredWorkField,
  createShedSubagentsField,
  restoreShedStatusFields
} from './agent-hook-relay'
import type { ParsedAgentStatusPayload } from '../../agent-status/contracts/agent-status-types'

describe('restoreShedStatusFields', () => {
  const roster = [{ id: 'child-1', agentType: 'reviewer', state: 'working' as const, startedAt: 1 }]
  const cached: ParsedAgentStatusPayload = {
    state: 'working',
    prompt: 'p',
    agentType: 'claude',
    subagents: roster,
    lastAssistantMessage: 'cached message',
    interactivePrompt: '{"questions":["old"]}'
  }
  const shed: ParsedAgentStatusPayload = { state: 'done', prompt: 'p', agentType: 'claude' }

  it('restores a matching shed roster, so a done pane is not falsely hibernation-eligible', () => {
    const restored = restoreShedStatusFields(shed, [createShedSubagentsField(roster)], cached)
    expect(restored.subagents).toEqual(roster)
    expect(restored.state).toBe('done')
    expect(restored.lastAssistantMessage).toBeUndefined()
  })

  it('does not restore a shed roster across a prompt identity change', () => {
    const nextTurn = { ...shed, prompt: 'next prompt' }
    const restored = restoreShedStatusFields(
      nextTurn,
      ['lastAssistantMessage', createShedSubagentsField(roster)],
      cached
    )
    expect(restored.lastAssistantMessage).toBeUndefined()
    expect(restored.subagents).toBeUndefined()
    expect(restored).toBe(nextTurn)
  })

  it('does not restore the cached roster when the shed roster digest changed', () => {
    const changedRoster = [
      { id: 'child-2', agentType: 'reviewer', state: 'working' as const, startedAt: 2 }
    ]
    const restored = restoreShedStatusFields(
      shed,
      [createShedSubagentsField(changedRoster)],
      cached
    )
    expect(restored.subagents).toBeUndefined()
    expect(restored).toBe(shed)
  })

  it('does not overwrite a roster the envelope still carries', () => {
    const freshRoster = [
      { id: 'child-fresh', agentType: 'reviewer', state: 'working' as const, startedAt: 2 }
    ]
    const fresh: ParsedAgentStatusPayload = { ...shed, subagents: freshRoster }
    const restored = restoreShedStatusFields(fresh, [createShedSubagentsField(roster)], cached)
    expect(restored.subagents).toEqual(freshRoster)
  })

  describe('monitoredWork', () => {
    const work = [{ id: 'shell-1', kind: 'command' as const, label: 'watch', firstObservedAt: 5 }]
    const withWork: ParsedAgentStatusPayload = { ...cached, monitoredWork: work }

    it('restores a matching shed list, so monitoring rows do not blank in transit', () => {
      const restored = restoreShedStatusFields(shed, [createShedMonitoredWorkField(work)], withWork)
      expect(restored.monitoredWork).toEqual(work)
      expect(restored.subagents).toBeUndefined()
    })

    it('does not restore a changed list or across a prompt change', () => {
      const changed = [{ ...work[0], id: 'shell-2' }]
      expect(restoreShedStatusFields(shed, [createShedMonitoredWorkField(changed)], withWork)).toBe(
        shed
      )
      const nextTurn = { ...shed, prompt: 'next prompt' }
      expect(
        restoreShedStatusFields(nextTurn, [createShedMonitoredWorkField(work)], withWork)
      ).toBe(nextTurn)
    })

    it('restores both shed fields together', () => {
      const restored = restoreShedStatusFields(
        shed,
        [createShedMonitoredWorkField(work), createShedSubagentsField(roster)],
        withWork
      )
      expect(restored.monitoredWork).toEqual(work)
      expect(restored.subagents).toEqual(roster)
    })
  })
})
