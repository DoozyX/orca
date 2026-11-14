import { buildManagedCommandHook } from '../../agent-hooks/installation/configuration/hook-config-schema'
import type { HookCommandConfig } from '../../agent-hooks/installation/configuration/hook-config-schema'
import { wrapRuntimeHomePosixHookCommand } from '../../agent-hooks/installation/commands/runtime-home-hook-command'
import { isWslGuestProcess } from '../../ipc/wsl-guest-windows-drive-path'
import {
  CLAUDE_HOOK_SETTINGS,
  getManagedLifecycleHook,
  getRemoteManagedEventCommand,
  getScriptBaseName,
  type ClaudeCompatibleHookSettings,
  type NativeHookFormOptions
} from './hook-settings'

// Why 130 s: a worker's request waits up to Orca's 122 s hold, past Claude's own 2:00 auto-block.
const CLAUDE_PERMISSION_HOOK_TIMEOUT_SECONDS = 130

// Fork-only: Claude logs the whole command on every tool call; a WSL home stays reachable from Windows.
function getLocalPosixEventCommand(
  eventName: string,
  scriptPath: string,
  settings: ClaudeCompatibleHookSettings
): string {
  return settings.scriptBaseName === 'claude-hook' && !isWslGuestProcess()
    ? wrapRuntimeHomePosixHookCommand(getScriptBaseName(scriptPath), {
        neutralJsonWhenMissing: eventName !== 'PostCompact'
      })
    : getRemoteManagedEventCommand(eventName, scriptPath)
}

/** The managed entry for one Claude hook event; only PermissionRequest waits longer than the shared timeout. */
export function getManagedEventHook(
  eventName: string,
  scriptPath: string,
  settings = CLAUDE_HOOK_SETTINGS,
  nativeHookPath: string | null = null,
  options: NativeHookFormOptions = {}
): HookCommandConfig {
  return process.platform === 'win32'
    ? getManagedLifecycleHook(scriptPath, settings, nativeHookPath, options)
    : buildManagedCommandHook(
        getLocalPosixEventCommand(eventName, scriptPath, settings),
        eventName === 'PermissionRequest' ? CLAUDE_PERMISSION_HOOK_TIMEOUT_SECONDS : undefined
      )
}
