import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalBuildVersion } from './build-mac-local.mjs'

describe('createLocalBuildVersion', () => {
  it('creates unique valid prerelease versions without changing the release base', () => {
    expect(createLocalBuildVersion('1.4.159-rc.0', 123456, 'abc123')).toBe(
      '1.4.159-rc.0.local.123456.abc123'
    )
    expect(createLocalBuildVersion('1.4.159', 123456, 'abc123')).toBe('1.4.159-local.123456.abc123')
  })

  it('sanitizes commit identifiers', () => {
    expect(createLocalBuildVersion('1.0.0', 1, 'abc/def')).toBe('1.0.0-local.1.abcdef')
  })

  it('uses the newest stable without a patch bump when package.json is behind', () => {
    expect(createLocalBuildVersion('1.4.197', 123456, 'abc123', ['v1.4.207'])).toBe(
      '1.4.207-local.123456.abc123'
    )
  })

  it('keeps the version being developed when the highest tag is a prerelease', () => {
    expect(
      createLocalBuildVersion('1.4.197', 123456, 'abc123', ['v1.4.207', 'v1.4.208-rc.1'])
    ).toBe('1.4.208-local.123456.abc123')
  })
})

const fixtures = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true })
  }
})

function createBuildRepo() {
  const root = mkdtempSync(join(tmpdir(), 'orca-local-version-'))
  fixtures.push(root)
  const cwd = join(root, 'checkout')
  const remote = join(root, 'origin')
  mkdirSync(cwd)
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
  git('init')
  git(
    '-c',
    'user.name=Build Test',
    '-c',
    'user.email=build@example.test',
    'commit',
    '--allow-empty',
    '-m',
    'initial'
  )
  git('tag', 'v1.4.207')
  git('clone', '--bare', cwd, remote)
  git('remote', 'add', 'origin', remote)
  git('tag', '-d', 'v1.4.207')
  git('tag', 'v1.4.200')
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '1.4.197' }))
  return { cwd, git }
}

function readBuildIdentity(cwd, publishedVersions = '') {
  const script = new URL('./build-mac-local.mjs', import.meta.url).href
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { getLocalBuildIdentity } from ${JSON.stringify(script)}; console.log(JSON.stringify(getLocalBuildIdentity()))`
      ],
      { cwd, encoding: 'utf8', env: { ...process.env, ORCA_PUBLISHED_VERSIONS: publishedVersions } }
    )
  )
}

describe('local build identity', () => {
  it('uses origin tags even when cached tags and package.json are stale', () => {
    const { cwd } = createBuildRepo()
    expect(readBuildIdentity(cwd).version).toMatch(/^1\.4\.207-local\.\d+\.[a-f0-9]+$/)
  })

  it('uses cached tags when origin is unavailable', () => {
    const { cwd, git } = createBuildRepo()
    git('remote', 'remove', 'origin')
    expect(readBuildIdentity(cwd).version).toMatch(/^1\.4\.200-local\./)
  })

  it('uses an explicit published-version list for reproducible builds', () => {
    const { cwd } = createBuildRepo()
    expect(readBuildIdentity(cwd, 'v1.4.210').version).toMatch(/^1\.4\.210-local\./)
  })
})
