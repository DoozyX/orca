import './rpc/unused-default-rpc-methods.test-fixture'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { readRuntimeMetadata } from './runtime-metadata'
import { classifyRuntimeLongPoll } from './runtime-rpc/runtime-rpc-long-poll'
import { createLongPollServer as createServer } from './runtime-rpc-long-poll-server.test-fixture'
import { openFramedSession } from './runtime-rpc-test-harness'

describe('browser bridge calls on the runtime socket', () => {
  // #28: a hung page queues later bridge calls past the 30 s idle timer, reading as a dead runtime.
  it.each(['browser.snapshot', 'browser.wait', 'browser.goto', 'browser.viewport'])(
    'keeps %s alive past the socket idle timeout',
    async (method) => {
      expect(classifyRuntimeLongPoll({ id: 'req_browser', authToken: 'token', method })).toBe(
        'wait'
      )
      const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
      const runtime = new OrcaRuntimeService()
      const server = createServer({ runtime, userDataPath, keepaliveIntervalMs: 10_000 })
      let handlerStarted: () => void = () => {}
      const started = new Promise<void>((resolve) => {
        handlerStarted = resolve
      })
      vi.spyOn(server['dispatcher'], 'dispatch').mockImplementation(async (request) => {
        handlerStarted()
        await new Promise((resolve) => setTimeout(resolve, 31_000))
        return {
          id: request.id,
          ok: true,
          result: { browserPageId: 'page-1' },
          _meta: { runtimeId: runtime.getRuntimeId() }
        }
      })
      await server.start()
      // Socket I/O stays real; only the handler's 31 s and the keepalive interval are faked.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
      try {
        const metadata = readRuntimeMetadata(userDataPath)
        const session = openFramedSession(metadata!.transports[0]!.endpoint, {
          id: 'req_browser',
          authToken: metadata!.authToken,
          method,
          params: { page: 'page-1' }
        })
        await started
        await vi.advanceTimersByTimeAsync(31_000)
        await session.done

        const keepalives = session.frames.filter((frame) => frame._keepalive === true)
        const terminals = session.frames.filter((frame) => frame.ok !== undefined)
        expect(keepalives.length).toBeGreaterThanOrEqual(1)
        expect(terminals).toEqual([
          expect.objectContaining({
            id: 'req_browser',
            ok: true,
            result: { browserPageId: 'page-1' }
          })
        ])
        expect(session.frames.indexOf(keepalives[0]!)).toBeLessThan(
          session.frames.indexOf(terminals[0]!)
        )
      } finally {
        vi.useRealTimers()
        await server.stop()
      }
    }
  )
})
