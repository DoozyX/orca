import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FRAMEWORK_NAME = 'SimulatorKit.framework'
const FRAMEWORK_BINARY_RELATIVE_PATH = join('Versions', 'A', 'SimulatorKit')

function resolveDeveloperDir(): string | null {
  const configured = process.env.DEVELOPER_DIR?.trim()
  if (configured) {
    return configured
  }
  try {
    const output = execFileSync('/usr/bin/xcode-select', ['-p'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return output || null
  } catch {
    return null
  }
}

export function findSimulatorKitFramework(
  developerDir: string | null = resolveDeveloperDir()
): string | null {
  const candidates = [
    // Xcode 16.4+ ships SimulatorKit in the .app's SharedFrameworks, not under Developer.
    developerDir ? join(developerDir, '..', 'SharedFrameworks', FRAMEWORK_NAME) : null,
    developerDir ? join(developerDir, 'Library', 'PrivateFrameworks', FRAMEWORK_NAME) : null,
    join('/Library', 'Developer', 'PrivateFrameworks', FRAMEWORK_NAME)
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, FRAMEWORK_BINARY_RELATIVE_PATH))) {
      return resolve(candidate)
    }
  }
  return null
}

// serve-sim-bin links @rpath/SimulatorKit.framework, but its baked rpath list only names
// the build machine's /Applications/Xcode_16.4.app. `@executable_path/../lib` is the one
// rpath entry we own, so point it at whichever Xcode is actually installed (#serve-sim
// helper dyld failure). Re-run on every resolve: Xcode can be moved or upgraded.
export function linkSimulatorKitFramework(packageDir: string): void {
  if (process.platform !== 'darwin') {
    return
  }
  const framework = findSimulatorKitFramework()
  if (!framework) {
    return
  }
  const libDir = join(packageDir, 'lib')
  const linkPath = join(libDir, FRAMEWORK_NAME)
  try {
    const existing = lstatSync(linkPath, { throwIfNoEntry: false })
    if (existing?.isSymbolicLink() && readlinkSync(linkPath) === framework) {
      return
    }
    mkdirSync(libDir, { recursive: true })
    rmSync(linkPath, { recursive: true, force: true })
    symlinkSync(framework, linkPath)
  } catch {
    // Best-effort: without the link the helper fails with its own dyld error.
  }
}
