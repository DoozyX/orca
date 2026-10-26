import { join } from 'node:path'
import { isDirectory } from './claude-profile-homes'
// Keep the router setup graph out of scan workers.
import type { ClaudeProfileRouter } from './claude-profile-router'
import type { ClaudeBoundHomeOverride, ClaudeLaunchScope } from './claude-bound-home-route'
import type { ClaudeWslProfileRouter } from './claude-profile-wsl-router'
import type { ClaudeAccountSelectionTarget } from './runtime-selection'
import type { ClaudeObservedConfigDirs } from './claude-observed-config-dirs'

let installed: ClaudeProfileRouter | undefined
let installedBoundHome: ClaudeBoundHomeOverride | undefined

/** Installed by the desktop's account services; workers, child processes and orcad have none. */
export function installClaudeProfileRouter(
  router: ClaudeProfileRouter | undefined,
  boundHome?: ClaudeBoundHomeOverride
): void {
  installed = router
  installedBoundHome = boundHome
}

export function getClaudeProfileRouter(): ClaudeProfileRouter | undefined {
  return installed
}

let installedObserved: ClaudeObservedConfigDirs | undefined

export function installClaudeObservedConfigDirs(dirs: ClaudeObservedConfigDirs | undefined): void {
  installedObserved = dirs
}

export function getClaudeObservedConfigDirs(): ClaudeObservedConfigDirs | undefined {
  return installedObserved
}

let installedWsl: ClaudeWslProfileRouter | undefined

export function installClaudeWslProfileRouter(router: ClaudeWslProfileRouter | undefined): void {
  installedWsl = router
}

export function getClaudeWslProfileRouter(): ClaudeWslProfileRouter | undefined {
  return installedWsl
}

/**
 * A local or WSL pane's env with the routed account's pointer added; SSH panes keep theirs.
 * A pane in a project group bound to its own Claude home runs there instead, with no pointer.
 */
export function withClaudeProfileTerminalEnv<Env extends Record<string, string> | undefined>(
  env: Env,
  connectionId: string | null | undefined,
  target: ClaudeAccountSelectionTarget,
  scope?: ClaudeLaunchScope
): Env | Record<string, string> {
  if (connectionId) {
    return env
  }
  const profileEnv =
    installedBoundHome?.terminalEnv(target, scope) ?? installed?.terminalEnv(target)
  return profileEnv ? { ...env, ...profileEnv } : env
}

/** The user's CLAUDE_CONFIG_DIR from the login shell, folders Orca saw Claude use, and account homes. */
export function claudeProfileHistoryDirs(surface: 'projects' | 'transcripts'): string[] {
  const homes = [
    installed?.userConfigDir(),
    ...(installedObserved?.list() ?? []),
    ...(installed?.accountHomes() ?? [])
  ].filter((home): home is string => Boolean(home))
  const dirs = homes.map((home) => join(home, surface)).filter(isDirectory)
  return dirs.filter((dir, index) => dirs.indexOf(dir) === index)
}
