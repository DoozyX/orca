import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

function fingerprint(app) {
  if (!existsSync(app)) {
    return null
  }
  return createHash('sha256')
    .update(readFileSync(join(app, 'Contents', 'Info.plist')))
    .update(readFileSync(join(app, 'Contents', 'Resources', 'app.asar')))
    .digest('hex')
}

function verifyMacApp(app) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' })
  const plist = join(app, 'Contents', 'Info.plist')
  const readKey = (key) =>
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
      encoding: 'utf8'
    }).trim()
  if (readKey('CFBundleIdentifier') !== 'com.stablyai.orca') {
    throw new Error('The built app is not Orca.')
  }
  return readKey('CFBundleShortVersionString')
}

export function installLocalMacApp({
  sourceApp,
  expectedVersion,
  destinationApp = join('/Applications', 'Orca.app'),
  platform = process.platform,
  copyApp = (source, target) => execFileSync('ditto', [source, target], { stdio: 'inherit' }),
  verifyApp = verifyMacApp
}) {
  if (platform !== 'darwin') {
    throw new Error('Local app installation requires macOS.')
  }
  const version = verifyApp(sourceApp)
  if (expectedVersion && version !== expectedVersion) {
    throw new Error(
      `Built app version ${version} does not match expected version ${expectedVersion}.`
    )
  }
  const sourceFingerprint = fingerprint(sourceApp)
  const installedFingerprint = fingerprint(destinationApp)
  mkdirSync(dirname(destinationApp), { recursive: true })
  const stagingDirectory = mkdtempSync(join(dirname(destinationApp), '.orca-local-install-'))
  const stagedApp = join(stagingDirectory, 'Orca.app')
  const previousApp = join(stagingDirectory, 'previous.app')
  try {
    copyApp(sourceApp, stagedApp)
    if (verifyApp(stagedApp) !== version || fingerprint(stagedApp) !== sourceFingerprint) {
      throw new Error('The staged app does not match the verified build.')
    }
    if (fingerprint(destinationApp) !== installedFingerprint) {
      throw new Error('Installed Orca changed during the build copy; refusing replacement.')
    }
    if (installedFingerprint !== null) {
      renameSync(destinationApp, previousApp)
    }
    try {
      renameSync(stagedApp, destinationApp)
      if (
        verifyApp(destinationApp) !== version ||
        fingerprint(destinationApp) !== sourceFingerprint
      ) {
        throw new Error('The installed app does not match the verified build.')
      }
    } catch (error) {
      if (existsSync(destinationApp)) {
        renameSync(destinationApp, stagedApp)
      }
      if (existsSync(previousApp)) {
        renameSync(previousApp, destinationApp)
      }
      throw error
    }
    rmSync(previousApp, { recursive: true, force: true })
    return { destinationApp, version }
  } finally {
    // Preserve the displaced app if rollback itself fails.
    if (!existsSync(previousApp)) {
      rmSync(stagingDirectory, { recursive: true, force: true })
    }
  }
}
