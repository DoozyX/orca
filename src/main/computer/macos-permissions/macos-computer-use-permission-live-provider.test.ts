import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as TimersPromises from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMacOSNativeHelperIdentity } from '../macos-native/macos-native-helper-identity'

const resolveHelperAppPathMock = vi.hoisted(() => vi.fn())
const resolveHelperExecutablePathMock = vi.hoisted(() => vi.fn())
const runProcessMock = vi.hoisted(() => vi.fn())
const callComputerSidecarLiveProviderMock = vi.hoisted(() => vi.fn())
const permissionStatusDelayMock = vi.hoisted(() =>
  vi.fn(
    (milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds)
      })
  )
)
const permissionStatusTempDir = '/tmp/orca-computer-use-permissions-test'

vi.mock('@orca/process-host', () => ({ runProcess: runProcessMock }))

// The status poll's promise delay must use the fake clock this suite controls.
vi.mock('node:timers/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof TimersPromises>()),
  setTimeout: permissionStatusDelayMock
}))

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(() => {
    const child = {
      stdout: { off: vi.fn(), on: vi.fn(), setEncoding: vi.fn() },
      stderr: { off: vi.fn(), on: vi.fn(), setEncoding: vi.fn() },
      on: vi.fn((event: string, callback: (status: number) => void) => {
        if (event === 'close') {
          queueMicrotask(() => callback(0))
        }
        return child
      }),
      off: vi.fn(() => child),
      unref: vi.fn()
    }
    return child
  }),
  spawnSync: vi.fn()
}))

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn()
}))

vi.mock('../sidecar-transport/sidecar-client', () => ({
  callComputerSidecarLiveProvider: callComputerSidecarLiveProviderMock
}))

vi.mock('../macos-native/macos-native-provider-paths', () => ({
  resolveMacOSComputerUseAppPath: resolveHelperAppPathMock,
  resolveMacOSComputerUseExecutablePath: resolveHelperExecutablePathMock
}))

describe('getComputerUsePermissionStatus', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.mocked(spawn).mockClear()
    vi.mocked(spawnSync).mockClear()
    vi.mocked(execFileSync).mockReset()
    vi.mocked(mkdtemp).mockReset()
    vi.mocked(readFile).mockReset()
    vi.mocked(rm).mockReset()
    vi.mocked(stat).mockReset()
    runProcessMock.mockReset()
    callComputerSidecarLiveProviderMock.mockReset()
    callComputerSidecarLiveProviderMock.mockResolvedValue(null)
    permissionStatusDelayMock.mockClear()
    runProcessMock.mockResolvedValue({
      code: 1,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false
    })
    resolveHelperAppPathMock.mockReset()
    resolveHelperExecutablePathMock.mockReset()
    resolveHelperAppPathMock.mockReturnValue('/Applications/Orca Computer Use.app')
    resolveHelperExecutablePathMock.mockReturnValue(
      '/Applications/Orca Computer Use.app/Contents/MacOS/orca-computer-use-macos'
    )
    vi.mocked(mkdtemp).mockResolvedValue(permissionStatusTempDir)
    vi.mocked(stat).mockResolvedValue(statSync(tmpdir()))
    mockPermissionStatus('{"accessibility":"granted","screenshots":"granted"}')
    setPlatform('darwin')
  })

  afterEach(() => {
    vi.useRealTimers()
    setPlatform(originalPlatform)
  })

  // #14: the status probe checks the current helper; live calls may run a removed install's.
  describe('live provider', () => {
    let helperDirectory = ''
    let currentHelper = ''

    beforeEach(() => {
      helperDirectory = mkdtempSync(join(tmpdir(), 'orca-live-helper-'))
      currentHelper = join(helperDirectory, 'orca-computer-use-macos')
      writeFileSync(currentHelper, '')
      resolveHelperExecutablePathMock.mockReturnValue(currentHelper)
    })

    afterEach(() => {
      rmSync(helperDirectory, { recursive: true, force: true })
    })

    it('omits liveProvider when the sidecar runs no helper', async () => {
      const { getComputerUsePermissionStatus } =
        await import('./macos-computer-use-permission-status')

      const status = await getComputerUsePermissionStatus()

      expect(status).not.toHaveProperty('liveProvider')
      expect(callComputerSidecarLiveProviderMock).toHaveBeenCalledTimes(1)
      expect(spawn).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['the current helper', 0, true],
      ['another helper', 1, false]
    ])('reports a live provider running %s', async (_label, inodeShift, matchesCurrentHelper) => {
      const { getComputerUsePermissionStatus } =
        await import('./macos-computer-use-permission-status')
      const current = readMacOSNativeHelperIdentity(currentHelper)
      callComputerSidecarLiveProviderMock.mockResolvedValue({
        ...current,
        ino: current.ino + inodeShift
      })

      await expect(getComputerUsePermissionStatus()).resolves.toMatchObject({
        helperUnavailableReason: null,
        permissions: [
          { id: 'accessibility', status: 'granted' },
          { id: 'screenshots', status: 'granted' }
        ],
        liveProvider: { executablePath: realpathSync(currentHelper), matchesCurrentHelper }
      })
      expect(callComputerSidecarLiveProviderMock).toHaveBeenCalledTimes(1)
      expect(spawn).toHaveBeenCalledTimes(1)
    })

    it('never matches a live provider when no current helper resolves', async () => {
      const { getComputerUsePermissionStatus } =
        await import('./macos-computer-use-permission-status')
      callComputerSidecarLiveProviderMock.mockResolvedValue(
        readMacOSNativeHelperIdentity(currentHelper)
      )
      resolveHelperAppPathMock.mockReturnValue(null)

      await expect(getComputerUsePermissionStatus()).resolves.toMatchObject({
        helperUnavailableReason: 'Orca Computer Use.app was not found',
        liveProvider: { executablePath: realpathSync(currentHelper), matchesCurrentHelper: false }
      })
    })
  })
})

function mockPermissionStatus(json: string): void {
  vi.mocked(spawnSync).mockReturnValue({
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null
  })
  vi.mocked(readFile).mockResolvedValue(json)
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
}
