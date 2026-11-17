import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMacOSNativeHelperIdentity } from '../macos-native/macos-native-helper-identity'

const resolveHelperAppPathMock = vi.hoisted(() => vi.fn())
const resolveHelperExecutablePathMock = vi.hoisted(() => vi.fn())
const runProcessMock = vi.hoisted(() => vi.fn())
const callComputerSidecarLiveProviderMock = vi.hoisted(() => vi.fn())

vi.mock('@orca/process-host', () => ({ runProcess: runProcessMock }))

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
    runProcessMock.mockReset()
    callComputerSidecarLiveProviderMock.mockReset()
    callComputerSidecarLiveProviderMock.mockResolvedValue(null)
    resolveHelperAppPathMock.mockReset()
    resolveHelperExecutablePathMock.mockReset()
    resolveHelperAppPathMock.mockReturnValue('/Applications/Orca Computer Use.app')
    resolveHelperExecutablePathMock.mockReturnValue(
      '/Applications/Orca Computer Use.app/Contents/MacOS/orca-computer-use-macos'
    )
    runProcessMock.mockResolvedValue({
      code: 0,
      signal: null,
      stdout: '{"accessibility":"granted","screenshots":"granted"}',
      stderr: '',
      timedOut: false
    })
    setPlatform('darwin')
  })

  afterEach(() => {
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
      expect(runProcessMock).toHaveBeenCalledTimes(1)
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
      expect(runProcessMock).toHaveBeenCalledTimes(1)
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

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
}
