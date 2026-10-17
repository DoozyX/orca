import { realpathSync, statSync } from 'node:fs'
import { RuntimeClientError } from './runtime-client-error'

/** The helper executable a provider runs. JSON-safe, so it crosses the sidecar IPC unchanged. */
export type MacOSNativeHelperIdentity = {
  executablePath: string
  dev: number
  ino: number
  mtimeMs: number
}

// Why the executable, not `helperAppPath`: a reinstall replaces the binary inside the same bundle path.
export function readMacOSNativeHelperIdentity(executablePath: string): MacOSNativeHelperIdentity {
  const resolvedPath = realpathSync(executablePath)
  const stats = statSync(resolvedPath)
  return { executablePath: resolvedPath, dev: stats.dev, ino: stats.ino, mtimeMs: stats.mtimeMs }
}

export function isSameMacOSNativeHelper(
  left: MacOSNativeHelperIdentity,
  right: MacOSNativeHelperIdentity
): boolean {
  return (
    left.executablePath === right.executablePath &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mtimeMs === right.mtimeMs
  )
}

export function isMacOSNativeHelperIdentity(value: unknown): value is MacOSNativeHelperIdentity {
  if (!value || typeof value !== 'object') {
    return false
  }
  return (
    'executablePath' in value &&
    typeof value.executablePath === 'string' &&
    'dev' in value &&
    typeof value.dev === 'number' &&
    'ino' in value &&
    typeof value.ino === 'number' &&
    'mtimeMs' in value &&
    typeof value.mtimeMs === 'number'
  )
}

/** Checks the sidecar's `liveProvider` answer where it crosses the IPC boundary. */
export function parseLiveHelperIdentity(value: unknown): MacOSNativeHelperIdentity | null {
  if (value === null || isMacOSNativeHelperIdentity(value)) {
    return value
  }
  throw new RuntimeClientError('accessibility_error', 'computer sidecar sent a malformed identity')
}

export function describeLiveHelper(
  currentExecutablePath: string | null,
  live: MacOSNativeHelperIdentity
): { executablePath: string; matchesCurrentHelper: boolean } {
  return {
    executablePath: live.executablePath,
    matchesCurrentHelper:
      currentExecutablePath !== null &&
      isSameMacOSNativeHelper(readMacOSNativeHelperIdentity(currentExecutablePath), live)
  }
}

/** The helper a provider's current generation started; a reinstall shows up as a changed identity. */
export class MacOSNativeHelperGeneration {
  private started: MacOSNativeHelperIdentity | null = null

  get identity(): MacOSNativeHelperIdentity | null {
    return this.started
  }

  record(executablePath: string): void {
    this.started = readMacOSNativeHelperIdentity(executablePath)
  }

  clear(): void {
    this.started = null
  }

  changedFrom(currentExecutablePath: string | null): boolean {
    return (
      this.started !== null &&
      currentExecutablePath !== null &&
      !isSameMacOSNativeHelper(this.started, readMacOSNativeHelperIdentity(currentExecutablePath))
    )
  }
}
