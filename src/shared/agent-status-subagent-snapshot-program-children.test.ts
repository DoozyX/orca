import { describe, expect, it } from 'vitest'
import {
  programStatusChildrenUnchanged,
  type AgentSubagentSnapshot
} from './agent-status-subagent-snapshot'

const child: AgentSubagentSnapshot = { id: 'c1', state: 'working', startedAt: 1 }

describe('programStatusChildrenUnchanged', () => {
  it('treats a child-list-only OSC 7501 change as news', () => {
    const event = { fromProgramStatus: true, payload: { subagents: [child] } }
    expect(programStatusChildrenUnchanged(event, { subagents: [] })).toBe(false)
    expect(programStatusChildrenUnchanged(event, undefined)).toBe(false)
  })

  it('treats an OSC 7501 report with the same children as unchanged', () => {
    const event = { fromProgramStatus: true, payload: { subagents: [{ ...child }] } }
    expect(programStatusChildrenUnchanged(event, { subagents: [child] })).toBe(true)
  })

  it('ignores children for reports that are not program status', () => {
    const event = { payload: { subagents: [child] } }
    expect(programStatusChildrenUnchanged(event, { subagents: [] })).toBe(true)
  })
})
