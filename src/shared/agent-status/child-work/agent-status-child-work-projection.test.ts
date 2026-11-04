import { describe, expect, it } from 'vitest'
import {
  projectAgentChildWorkMonitoredWork,
  type AgentChildWorkLegacyProjectionCandidate
} from './agent-status-child-work-projection'

function candidate(
  providerId: string,
  overrides: Partial<AgentChildWorkLegacyProjectionCandidate> = {}
): AgentChildWorkLegacyProjectionCandidate {
  return {
    providerId,
    kind: 'agent',
    state: 'working',
    membership: 'live',
    firstObservedAt: 123,
    description: 'Investigate',
    agentType: 'researcher',
    model: 'model-a',
    stoppable: true,
    ...overrides
  }
}

describe('projectAgentChildWorkMonitoredWork', () => {
  it('lists live running non-agent work with its label and first observation', () => {
    expect(
      projectAgentChildWorkMonitoredWork([
        candidate('child', { kind: 'agent' }),
        candidate('shell', { kind: 'command', description: 'Wait for report', firstObservedAt: 7 }),
        candidate('watch', {
          kind: 'monitor',
          description: undefined,
          name: 'tail log',
          firstObservedAt: 8
        }),
        candidate('flow', {
          kind: 'workflow',
          state: 'monitoring',
          description: undefined,
          firstObservedAt: 9
        }),
        candidate('finished', { kind: 'command', state: 'done' }),
        candidate('stopped', { kind: 'command', state: 'idle' }),
        candidate('settled', { kind: 'command', membership: 'settled' }),
        candidate(' ', { kind: 'command' }),
        candidate('undated', { kind: 'command', firstObservedAt: Number.NaN })
      ])
    ).toEqual([
      { id: 'shell', kind: 'command', label: 'Wait for report', firstObservedAt: 7 },
      { id: 'watch', kind: 'monitor', label: 'tail log', firstObservedAt: 8 },
      { id: 'flow', kind: 'workflow', firstObservedAt: 9 }
    ])
  })

  it('is absent when nothing qualifies', () => {
    expect(projectAgentChildWorkMonitoredWork([candidate('child')])).toBeUndefined()
  })
})
