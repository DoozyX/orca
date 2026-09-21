import { lstatSync, readlinkSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findSimulatorKitFramework, linkSimulatorKitFramework } from './serve-sim-simulatorkit-link'

const cleanupPaths: string[] = []

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-simulatorkit-link-'))
  cleanupPaths.push(root)
  return root
}

async function createFramework(parentDir: string): Promise<string> {
  const frameworkDir = join(parentDir, 'SimulatorKit.framework')
  await mkdir(join(frameworkDir, 'Versions', 'A'), { recursive: true })
  await writeFile(join(frameworkDir, 'Versions', 'A', 'SimulatorKit'), 'mach-o')
  return frameworkDir
}

describe('serve-sim SimulatorKit link', () => {
  afterEach(async () => {
    for (const path of cleanupPaths.splice(0)) {
      await rm(path, { recursive: true, force: true })
    }
  })

  it('prefers the Xcode app SharedFrameworks copy over Developer/Library/PrivateFrameworks', async () => {
    const root = await createRoot()
    const developerDir = join(root, 'Xcode.app', 'Contents', 'Developer')
    await mkdir(join(developerDir, 'Library', 'PrivateFrameworks'), { recursive: true })
    await mkdir(join(root, 'Xcode.app', 'Contents', 'SharedFrameworks'), { recursive: true })
    const shared = await createFramework(join(root, 'Xcode.app', 'Contents', 'SharedFrameworks'))
    await createFramework(join(developerDir, 'Library', 'PrivateFrameworks'))

    expect(findSimulatorKitFramework(developerDir)).toBe(shared)
  })

  it('ignores a framework directory with no binary inside', async () => {
    const root = await createRoot()
    const developerDir = join(root, 'Xcode.app', 'Contents', 'Developer')
    await mkdir(join(developerDir, 'Library', 'PrivateFrameworks', 'SimulatorKit.framework'), {
      recursive: true
    })

    expect(findSimulatorKitFramework(developerDir)).toBeNull()
  })

  it.runIf(process.platform === 'darwin')(
    'links the framework into the package lib dir the helper rpath points at',
    async () => {
      const root = await createRoot()
      const developerDir = join(root, 'Xcode.app', 'Contents', 'Developer')
      await mkdir(join(root, 'Xcode.app', 'Contents', 'SharedFrameworks'), { recursive: true })
      const framework = await createFramework(
        join(root, 'Xcode.app', 'Contents', 'SharedFrameworks')
      )
      const packageDir = join(root, 'serve-sim')
      await mkdir(packageDir, { recursive: true })

      process.env.DEVELOPER_DIR = developerDir
      try {
        linkSimulatorKitFramework(packageDir)
        linkSimulatorKitFramework(packageDir)
      } finally {
        delete process.env.DEVELOPER_DIR
      }

      const linkPath = join(packageDir, 'lib', 'SimulatorKit.framework')
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(linkPath)).toBe(framework)
    }
  )

  it.runIf(process.platform === 'darwin')('replaces a stale link to a removed Xcode', async () => {
    const root = await createRoot()
    const developerDir = join(root, 'Xcode.app', 'Contents', 'Developer')
    await mkdir(join(root, 'Xcode.app', 'Contents', 'SharedFrameworks'), { recursive: true })
    const framework = await createFramework(join(root, 'Xcode.app', 'Contents', 'SharedFrameworks'))
    const packageDir = join(root, 'serve-sim')
    await mkdir(join(packageDir, 'lib'), { recursive: true })
    await symlink(
      join(root, 'Xcode_16.4.app', 'gone'),
      join(packageDir, 'lib', 'SimulatorKit.framework')
    )

    process.env.DEVELOPER_DIR = developerDir
    try {
      linkSimulatorKitFramework(packageDir)
    } finally {
      delete process.env.DEVELOPER_DIR
    }

    expect(readlinkSync(join(packageDir, 'lib', 'SimulatorKit.framework'))).toBe(framework)
  })
})
