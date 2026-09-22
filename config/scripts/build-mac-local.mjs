import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { installLocalMacApp } from './install-local-mac-app.mjs'
import { findInstalledMacSigningIdentity } from './mac-signing-identity.cjs'
import {
  readPublishedVersionsFromEnv,
  resolveDevChannelBaseVersion
} from './dev-channel-base-version.mjs'

export function createLocalBuildVersion(baseVersion, timestamp, commit, publishedVersions = []) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(baseVersion)) {
    throw new Error(`Package version is not valid semver: ${baseVersion}`)
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('Local build timestamp is invalid.')
  }
  const sanitizedCommit = commit.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12)
  if (!sanitizedCommit) {
    throw new Error('Git commit identity is empty.')
  }
  if (publishedVersions.length > 0) {
    baseVersion = resolveDevChannelBaseVersion(baseVersion, publishedVersions, {
      bumpStable: false
    })
  }
  const suffix = `local.${timestamp}.${sanitizedCommit}`
  return baseVersion.includes('-') ? `${baseVersion}.${suffix}` : `${baseVersion}-${suffix}`
}

export function getLocalBuildIdentity() {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8'
  }).trim()
  let publishedVersions = readPublishedVersionsFromEnv()
  if (publishedVersions.length === 0) {
    publishedVersions = execFileSync('git', ['tag', '--list', 'v[0-9]*'], {
      encoding: 'utf8'
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    try {
      const remoteTags = execFileSync(
        'git',
        ['ls-remote', '--tags', '--refs', 'origin', 'v[0-9]*'],
        {
          encoding: 'utf8',
          timeout: 15_000,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        }
      )
      publishedVersions.push(
        ...remoteTags.split('\n').flatMap((line) => {
          const tag = line.split('\trefs/tags/')[1]?.trim()
          return tag ? [tag] : []
        })
      )
    } catch {
      console.warn(
        '[build:mac] Origin version tags unavailable; using cached tags and package.json.'
      )
    }
  }
  return {
    commit,
    version: createLocalBuildVersion(packageJson.version, Date.now(), commit, publishedVersions)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const install = process.argv.includes('--install')
  if (install && (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch))) {
    throw new Error('Local app installation requires an Apple Silicon or Intel Mac.')
  }
  const identity = getLocalBuildIdentity()
  const signingIdentity = install
    ? process.env.CSC_NAME || findInstalledMacSigningIdentity() || '-'
    : null
  console.log(`[build:mac] local update version ${identity.version}`)
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      ...(install
        ? [
            `--${process.arch}`,
            '--dir',
            '--publish',
            'never',
            `--config.mac.identity=${signingIdentity}`
          ]
        : [])
    ],
    {
      env: {
        ...process.env,
        ORCA_BUILD_COMMIT: identity.commit,
        ORCA_LOCAL_BUILD_VERSION: identity.version
      },
      stdio: 'inherit'
    }
  )
  if (install) {
    const result = installLocalMacApp({
      sourceApp: resolve('dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Orca.app'),
      expectedVersion: identity.version
    })
    console.log(`[build:mac:install] Installed ${result.version} at ${result.destinationApp}`)
    console.log('Restart Orca when ready to use the new build. No backup was retained.')
  }
}
