import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi, describe, expect, it } from 'vitest'
import type * as GitBashModule from '../../pty/shell-startup/git-bash'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/userData'
  }
}))

const { gitBashAvailableMock } = vi.hoisted(() => ({ gitBashAvailableMock: { value: true } }))
vi.mock('../../pty/shell-startup/git-bash', async (importOriginal) => ({
  ...(await importOriginal<typeof GitBashModule>()),
  isGitBashAvailable: () => gitBashAvailableMock.value
}))

import { wrapRuntimeHomeHookCommand } from '../../agent-hooks/installation/commands/runtime-home-hook-command'
import { ClaudeHookService } from '../hook-service'

describe('ClaudeHookService.install', () => {
  it('does not re-install a managed statusLine the user deleted, until remove() resets the opt-out', () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'orca-claude-statusline-optout-'))
    vi.stubEnv('HOME', tmpHome)
    vi.stubEnv('USERPROFILE', tmpHome)
    try {
      const settingsPath = join(tmpHome, '.claude', 'settings.json')
      new ClaudeHookService().install()
      expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).statusLine).toBeTruthy()

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      delete settings.statusLine
      writeFileSync(settingsPath, JSON.stringify(settings))

      new ClaudeHookService().install()
      expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).statusLine).toBeUndefined()

      new ClaudeHookService().remove()
      new ClaudeHookService().install()
      expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).statusLine).toBeTruthy()
    } finally {
      vi.unstubAllEnvs()
      rmSync(tmpHome, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')(
    'replaces a cross-platform entry with one POSIX-only entry',
    () => {
      const tmpHome = mkdtempSync(join(tmpdir(), 'orca-claude-posix-command-'))
      vi.stubEnv('HOME', tmpHome)
      vi.stubEnv('WSL_DISTRO_NAME', '')
      vi.stubEnv('WSL_INTEROP', '')
      try {
        const settingsPath = join(tmpHome, '.claude', 'settings.json')
        mkdirSync(join(tmpHome, '.claude'))
        const crossPlatform = wrapRuntimeHomeHookCommand('claude-hook', {
          neutralJsonWhenMissing: true
        })
        writeFileSync(
          settingsPath,
          JSON.stringify({
            hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: crossPlatform }] }] }
          })
        )

        new ClaudeHookService().install()

        const script = '"${HOME-}/.orca/agent-hooks/claude-hook.sh"'
        expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).hooks.PreToolUse).toEqual([
          expect.objectContaining({
            hooks: [
              expect.objectContaining({
                command:
                  `if [ -n "\${HOME-}" ] && [ -f ${script} ] && [ -r ${script} ] && [ -x ${script} ]; ` +
                  `then ORCA_HOOK_AGENT_PID="\${PPID:-}"; export ORCA_HOOK_AGENT_PID; /bin/sh ${script}; ` +
                  "else { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; printf '{}\\n'; fi"
              })
            ]
          })
        ])
      } finally {
        vi.unstubAllEnvs()
        rmSync(tmpHome, { recursive: true, force: true })
      }
    }
  )
})
