import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentHookServer, _internals } from './server'
import { buildBody, postHookEvent, PANE } from './server.test-fixtures'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: vi.fn(() => ({ nth_repo_added: 2 }))
}))

const WATCH = {
  id: 'b727cb698',
  type: 'shell',
  status: 'running',
  description: 'watch for nonexistent file',
  command: 'until [ -f /nonexistent ]; do sleep 5; done'
}

describe('Last-status persistence of monitored work', () => {
  let userDataPath: string

  beforeEach(() => {
    _internals.resetCachesForTests()
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-laststatus-'))
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('writes the list and restores it on the next start', async () => {
    const writer = new AgentHookServer()
    await writer.start({ env: 'production', userDataPath })
    try {
      await postHookEvent(
        writer,
        buildBody({ hook_event_name: 'UserPromptSubmit', prompt: 'watch' }, { tabId: 'tab-1' })
      )
      await postHookEvent(
        writer,
        buildBody(
          {
            hook_event_name: 'Stop',
            background_tasks: [WATCH],
            session_crons: [{ id: 'c1', schedule: '*/30 * * * *', recurring: true, prompt: 'hi' }]
          },
          { tabId: 'tab-1' }
        )
      )
      writer.flushStatusPersistSync()
    } finally {
      writer.stop()
    }
    const file = JSON.parse(
      readFileSync(join(userDataPath, 'agent-hooks', 'last-status.json'), 'utf8')
    )
    expect(file.entries[PANE].payload.monitoredWork.map((item: { id: string }) => item.id)).toEqual(
      ['b727cb698', 'c1']
    )

    _internals.resetCachesForTests()
    const reader = new AgentHookServer()
    await reader.start({ env: 'production', userDataPath })
    try {
      const [row] = reader.getStatusSnapshot()
      expect(row.monitoredWork).toEqual([
        {
          id: 'b727cb698',
          kind: 'command',
          label: WATCH.description,
          detail: WATCH.command,
          firstObservedAt: expect.any(Number)
        },
        {
          id: 'c1',
          kind: 'cron',
          label: 'hi',
          detail: '*/30 * * * * · recurring',
          firstObservedAt: expect.any(Number)
        }
      ])
    } finally {
      reader.stop()
    }
  })
})
