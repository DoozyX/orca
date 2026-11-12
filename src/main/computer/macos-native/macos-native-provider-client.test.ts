import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  chmodSyncMock,
  connectMacOSProviderSocketMock,
  mkdtempSyncMock,
  realpathSyncMock,
  resolveMacOSComputerUseExecutablePathMock,
  rmSyncMock,
  spawnMock,
  statSyncMock,
  writeFileSyncMock
} = vi.hoisted(() => ({
  chmodSyncMock: vi.fn(),
  connectMacOSProviderSocketMock: vi.fn(),
  mkdtempSyncMock: vi.fn(),
  realpathSyncMock: vi.fn(),
  resolveMacOSComputerUseExecutablePathMock: vi.fn(),
  rmSyncMock: vi.fn(),
  spawnMock: vi.fn(),
  statSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn()
}))

vi.mock('child_process', () => ({
  spawn: spawnMock
}))

vi.mock('fs', () => ({
  chmodSync: chmodSyncMock,
  mkdtempSync: mkdtempSyncMock,
  realpathSync: realpathSyncMock,
  rmSync: rmSyncMock,
  statSync: statSyncMock,
  writeFileSync: writeFileSyncMock
}))

vi.mock('./macos-native-provider-paths', () => ({
  resolveMacOSComputerUseExecutablePath: resolveMacOSComputerUseExecutablePathMock
}))

vi.mock('./macos-native-provider-socket', () => ({
  connectMacOSProviderSocket: connectMacOSProviderSocketMock
}))

class FakeSocket extends EventEmitter {
  destroyed = false
  writes: string[] = []
  writeError: Error | null = null

  setEncoding(): void {}

  write(line: string, callback?: (error?: Error | null) => void): boolean {
    this.writes.push(line)
    callback?.(this.writeError)
    return true
  }

  end(): void {
    this.destroyed = true
  }

  destroy(): this {
    this.destroyed = true
    return this
  }
}

class FakeProvider extends EventEmitter {
  exitCode: number | null = null
  signalCode: string | null = null
  kill = vi.fn()
  unref = vi.fn()

  exit(code = 0): void {
    this.exitCode = code
    this.emit('exit', code, null)
  }
}

async function loadClientModule() {
  vi.resetModules()
  return await import('./macos-native-provider-client')
}

const HELPER_A = '/Applications/Orca Computer Use.app/Contents/MacOS/orca-computer-use-macos'
const HELPER_B = '/Applications/Orca Computer Use 2.app/Contents/MacOS/orca-computer-use-macos'

describe('MacOSNativeProviderClient', () => {
  const sockets: FakeSocket[] = []
  const providers: FakeProvider[] = []
  const helperInodes = new Map<string, number>()

  beforeEach(() => {
    vi.useFakeTimers()
    sockets.length = 0
    providers.length = 0
    helperInodes.clear()
    realpathSyncMock.mockImplementation((path: string) => path)
    statSyncMock.mockImplementation((path: string) => ({
      dev: 1,
      ino: helperInodes.get(path) ?? 1,
      mtimeMs: 1
    }))
    mkdtempSyncMock.mockImplementation((prefix: string) => `${prefix}${sockets.length}`)
    resolveMacOSComputerUseExecutablePathMock.mockReturnValue(HELPER_A)
    spawnMock.mockImplementation(() => {
      const provider = new FakeProvider()
      providers.push(provider)
      return provider
    })
    connectMacOSProviderSocketMock.mockImplementation(async () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    })
  })

  afterEach(() => {
    for (const result of spawnMock.mock.results) {
      if (result.value instanceof FakeProvider) {
        result.value.exit()
      }
    }
    chmodSyncMock.mockReset()
    connectMacOSProviderSocketMock.mockReset()
    mkdtempSyncMock.mockReset()
    realpathSyncMock.mockReset()
    resolveMacOSComputerUseExecutablePathMock.mockReset()
    rmSyncMock.mockReset()
    spawnMock.mockReset()
    statSyncMock.mockReset()
    writeFileSyncMock.mockReset()
    vi.useRealTimers()
  })

  async function answerNextRequest(socket: FakeSocket, result: unknown): Promise<void> {
    const answered = socket.writes.length
    await vi.waitFor(() => expect(socket.writes).toHaveLength(answered + 1))
    const request: unknown = JSON.parse(socket.writes[answered]!)
    if (!request || typeof request !== 'object' || !('id' in request)) {
      throw new TypeError(`expected a native request, got ${socket.writes[answered]}`)
    }
    socket.emit('data', `${JSON.stringify({ id: request.id, ok: true, result })}\n`)
  }

  // #14: a reinstall leaves the old helper (and its TCC attribution) answering live calls.
  it.each([
    [
      'another executable',
      () => resolveMacOSComputerUseExecutablePathMock.mockReturnValue(HELPER_B)
    ],
    ['a replaced executable at the same path', () => helperInodes.set(HELPER_A, 2)]
  ])('restarts the helper once it resolves to %s', async (_label, changeHelper) => {
    const { MacOSNativeProviderClient } = await loadClientModule()
    const client = new MacOSNativeProviderClient()
    const first = client.listApps()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    await answerNextRequest(sockets[0]!, macOSProviderCapabilities())
    await answerNextRequest(sockets[0]!, { apps: [] })
    await first
    expect(client.liveHelperIdentity()).toEqual({
      executablePath: HELPER_A,
      dev: 1,
      ino: 1,
      mtimeMs: 1
    })

    changeHelper()
    const second = client.listApps()
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    expect(sockets[0]!.destroyed).toBe(true)
    await answerNextRequest(sockets[1]!, macOSProviderCapabilities())
    await answerNextRequest(sockets[1]!, { apps: [] })
    await second
    const restartedPath = resolveMacOSComputerUseExecutablePathMock()
    expect(spawnMock.mock.calls.map((call) => call[0])).toEqual([HELPER_A, restartedPath])

    const third = client.listApps()
    await answerNextRequest(sockets[1]!, { apps: [] })
    await third
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(sockets).toHaveLength(2)
    client.shutdown()
    expect(client.liveHelperIdentity()).toBeNull()
  })

  it('reaps the helper process of a superseded startup', async () => {
    const pendingConnects: {
      resolve: (socket: FakeSocket) => void
    }[] = []
    connectMacOSProviderSocketMock.mockImplementation(
      async () =>
        await new Promise<FakeSocket>((resolve) => {
          pendingConnects.push({ resolve })
        })
    )
    const { MacOSNativeProviderClient } = await loadClientModule()
    const client = new MacOSNativeProviderClient()

    const firstCall = client.capabilities()
    await vi.waitFor(() => expect(pendingConnects).toHaveLength(1))

    client.shutdown()

    const secondCall = client.capabilities()
    await vi.waitFor(() => expect(pendingConnects).toHaveLength(2))
    const secondSocket = new FakeSocket()
    pendingConnects[1]!.resolve(secondSocket)
    await vi.waitFor(() => expect(secondSocket.writes).toHaveLength(1))
    const secondRequest = JSON.parse(secondSocket.writes[0]!) as { id: number }

    pendingConnects[0]!.resolve(new FakeSocket())
    await expect(firstCall).rejects.toThrow('native macOS provider startup was superseded')

    expect(providers[0]!.kill).toHaveBeenCalledTimes(1)
    expect(providers[0]!.kill).toHaveBeenCalledWith('SIGTERM')
    expect(providers[1]!.kill).not.toHaveBeenCalled()

    secondSocket.emit(
      'data',
      `${JSON.stringify({
        id: secondRequest.id,
        ok: true,
        result: { protocolVersion: 1, supports: {} }
      })}\n`
    )
    await expect(secondCall).resolves.toMatchObject({ protocolVersion: 1 })
  })
})

function macOSProviderCapabilities(actions: Partial<Record<string, boolean>> = {}) {
  return {
    platform: 'darwin',
    provider: 'orca-computer-use-macos',
    providerVersion: '1.0.0',
    protocolVersion: 1,
    supports: {
      apps: { list: true, bundleIds: true, pids: true },
      windows: {
        list: true,
        targetById: true,
        targetByIndex: true,
        focus: false,
        moveResize: false
      },
      observation: {
        screenshot: true,
        annotatedScreenshot: false,
        elementFrames: true,
        ocr: false
      },
      actions: {
        click: true,
        typeText: true,
        pressKey: true,
        hotkey: true,
        pasteText: true,
        scroll: true,
        drag: true,
        setValue: true,
        performAction: true,
        ...actions
      },
      surfaces: { menus: false, dialogs: false, dock: false, menubar: false }
    }
  }
}
