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
import { installLocalMacApp } from './install-local-mac-app.mjs'

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
