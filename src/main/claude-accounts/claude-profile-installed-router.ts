import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// Keep the router setup graph out of scan workers.
import type { ClaudeProfileRouter } from './claude-profile-router'
import type { ClaudeBoundHomeOverride, ClaudeLaunchScope } from './claude-bound-home-route'
import type { ClaudeWslProfileRouter } from './claude-profile-wsl-router'
import type { ClaudeAccountSelectionTarget } from './runtime-selection'

/** Exclude linked history directories to avoid reading them twice. */
export function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return false
  }
}

export function listClaudeProfileHomes(dataRoot: string): string[] {
  const root = join(dataRoot, 'claude-profiles')
  let ids: string[]
  try {
    ids = readdirSync(root)
  } catch {
    return []
  }
  return ids.map((id) => join(root, id, 'home')).filter(isDirectory)
}

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

/** Include account history only where setup could not link it into System default. */
export function claudeProfileHistoryDirs(surface: 'projects' | 'transcripts'): string[] {
  return (installed?.accountHomes() ?? []).map((home) => join(home, surface)).filter(isDirectory)
}
