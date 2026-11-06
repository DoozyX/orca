import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { installLocalMacApp, stopInstalledComputerUseHelpers } from './install-local-mac-app.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function writeApp(app, version) {
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true })
  writeFileSync(join(app, 'Contents', 'Info.plist'), version)
  writeFileSync(join(app, 'Contents', 'Resources', 'app.asar'), `bundle:${version}`)
}

function versionOf(app) {
  return readFileSync(join(app, 'Contents', 'Info.plist'), 'utf8')
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'orca-local-install-'))
  roots.push(root)
  const sourceApp = join(root, 'build', 'Orca.app')
  const applications = join(root, 'Applications')
  const destinationApp = join(applications, 'Orca.app')
  writeApp(sourceApp, '1.4.207-local.200.abc')
  writeApp(destinationApp, '1.4.207-local.100.abc')
  const options = {
    sourceApp,
    destinationApp,
    platform: 'darwin',
    stopHelperProcesses: () => {},
    copyApp: (source, target) => cpSync(source, target, { recursive: true }),
    verifyApp: versionOf
  }
  return { ...options, options, applications }
}

it('installs the verified build and retains no backup or staging directory', () => {
  const { options, destinationApp, applications } = fixture()
  const result = installLocalMacApp(options)
  expect(versionOf(destinationApp)).toBe('1.4.207-local.200.abc')
  expect(readdirSync(applications)).toEqual(['Orca.app'])
  expect(result.version).toBe('1.4.207-local.200.abc')
})

it('stops the old helper only after the replacement has been verified', () => {
  const { options, destinationApp } = fixture()
  let helperRunning = true
  installLocalMacApp({
    ...options,
    stopHelperProcesses: (app) => {
      expect(app).toBe(destinationApp)
      expect(versionOf(app)).toBe('1.4.207-local.200.abc')
      helperRunning = false
    }
  })
  expect(helperRunning).toBe(false)
})

it('leaves the helper running when installation rolls back', () => {
  const { options, destinationApp } = fixture()
  let helperRunning = true
  expect(() =>
    installLocalMacApp({
      ...options,
      verifyApp: (app) => {
        if (app === destinationApp) {
          throw new Error('Installed verification failed')
        }
        return versionOf(app)
      },
      stopHelperProcesses: () => {
        helperRunning = false
      }
    })
  ).toThrow('Installed verification failed')
  expect(helperRunning).toBe(true)
})

it('reports helper stop failures without rolling back the verified installation', () => {
  const { options, destinationApp, applications } = fixture()
  expect(() =>
    installLocalMacApp({
      ...options,
      stopHelperProcesses: () => {
        throw new Error('Helper stop failed')
      }
    })
  ).toThrow('Helper stop failed')
  expect(versionOf(destinationApp)).toBe('1.4.207-local.200.abc')
  expect(readdirSync(applications)).toEqual(['Orca.app'])
})

it('leaves the installed app intact when source verification fails', () => {
  const { options, destinationApp, applications } = fixture()
  expect(() =>
    installLocalMacApp({
      ...options,
      verifyApp: () => {
        throw new Error('Invalid signature')
      }
    })
  ).toThrow('Invalid signature')
  expect(versionOf(destinationApp)).toBe('1.4.207-local.100.abc')
  expect(readdirSync(applications)).toEqual(['Orca.app'])
})

it('rejects a stale build with the wrong version', () => {
  const { options, destinationApp } = fixture()
  expect(() =>
    installLocalMacApp({ ...options, expectedVersion: '1.4.207-local.999.abc' })
  ).toThrow(/version/i)
  expect(versionOf(destinationApp)).toBe('1.4.207-local.100.abc')
})

it('rejects a damaged copy before replacing the installed app', () => {
  const { options, destinationApp, applications } = fixture()
  expect(() =>
    installLocalMacApp({
      ...options,
      copyApp: (source, target) => {
        cpSync(source, target, { recursive: true })
        writeFileSync(join(target, 'Contents', 'Resources', 'app.asar'), 'damaged')
      }
    })
  ).toThrow(/changed|match/i)
  expect(versionOf(destinationApp)).toBe('1.4.207-local.100.abc')
  expect(readdirSync(applications)).toEqual(['Orca.app'])
})

it('preserves another installer update made while copying', () => {
  const { options, destinationApp } = fixture()
  expect(() =>
    installLocalMacApp({
      ...options,
      copyApp: (source, target) => {
        cpSync(source, target, { recursive: true })
        writeApp(destinationApp, '1.4.207-local.300.other')
      }
    })
  ).toThrow(/changed/i)
  expect(versionOf(destinationApp)).toBe('1.4.207-local.300.other')
})

it('restores the old app if verification at the installed path fails', () => {
  const { options, destinationApp, applications } = fixture()
  expect(() =>
    installLocalMacApp({
      ...options,
      verifyApp: (app) => {
        if (app === destinationApp) {
          throw new Error('Installed verification failed')
        }
        return versionOf(app)
      }
    })
  ).toThrow('Installed verification failed')
  expect(versionOf(destinationApp)).toBe('1.4.207-local.100.abc')
  expect(readdirSync(applications)).toEqual(['Orca.app'])
})

it('supports a first installation', () => {
  const { options, destinationApp } = fixture()
  rmSync(destinationApp, { recursive: true })
  installLocalMacApp(options)
  expect(versionOf(destinationApp)).toBe('1.4.207-local.200.abc')
})

it('rejects non-macOS hosts without replacing anything', () => {
  const { options, destinationApp } = fixture()
  expect(() => installLocalMacApp({ ...options, platform: 'linux' })).toThrow(/macOS/)
  expect(versionOf(destinationApp)).toBe('1.4.207-local.100.abc')
})

it('stops only agent processes from the exact installed helper path', () => {
  const app = '/Applications/Orca (Local).app'
  const executable = join(
    app,
    'Contents',
    'Resources',
    'Orca Computer Use.app',
    'Contents',
    'MacOS',
    'orca-computer-use-macos'
  )
  const otherCommands = [
    `${executable} --permission-status-file status.json`,
    `${executable.replace('Orca (Local).app', 'Orca (Local)Xapp')} --agent socket`,
    `/dev${executable} --agent socket`,
    `shell ${executable} --agent socket`
  ]
  let running = [`${executable} --agent socket --token-file token`, ...otherCommands]
  stopInstalledComputerUseHelpers(app, (command, args) => {
    if (command !== '/usr/bin/pkill' || args[0] !== '-TERM' || args[1] !== '-f') {
      throw new Error('Unexpected stop command')
    }
    const pattern = new RegExp(args[2])
    running = running.filter((processCommand) => !pattern.test(processCommand))
  })
  expect(running).toEqual(otherCommands)
})

it('accepts no running helper but reports process-tool failures', () => {
  expect(() =>
    stopInstalledComputerUseHelpers('/Applications/Orca.app', () => {
      throw Object.assign(new Error('No matches'), { status: 1 })
    })
  ).not.toThrow()
  expect(() =>
    stopInstalledComputerUseHelpers('/Applications/Orca.app', () => {
      throw Object.assign(new Error('Permission denied'), { status: 2 })
    })
  ).toThrow(
    'Orca was installed, but its Computer Use helper could not be stopped: Permission denied'
  )
})
