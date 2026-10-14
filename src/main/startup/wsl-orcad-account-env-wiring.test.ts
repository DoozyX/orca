import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import { getDefaultSettings } from '../../shared/constants'
import { withClaudeProfileTerminalEnv } from '../claude-accounts/claude-profile-installed-router'
import { installWslOrcadAccountEnvDependencies } from '../wsl/wsl-orcad-account-env'

vi.mock('../claude-accounts/claude-profile-installed-router', () => ({
  withClaudeProfileTerminalEnv: vi.fn(() => ({ ORCA_CLAUDE_PROFILE_POINTER: 'test-pointer' }))
}))
vi.mock('../wsl/wsl-orcad-account-env', () => ({
  installWslOrcadAccountEnvDependencies: vi.fn()
}))

import { installWslOrcadAccountShim, oncePerDistro } from './wsl-orcad-account-env-wiring'

describe('oncePerDistro', () => {
  it('tells the user about each distro once per run, whatever its casing', () => {
    const send = vi.fn()
    const notify = oncePerDistro(send)
    notify('Ubuntu')
    notify('ubuntu')
    notify('Debian')
    notify('Ubuntu')
    expect(send.mock.calls).toEqual([['Ubuntu'], ['Debian']])
  })
})

it('routes a WSL terminal account through the local account services for its target', () => {
  installWslOrcadAccountShim({ getSettings: () => getDefaultSettings('/workspace') })
  const dependencies = vi.mocked(installWslOrcadAccountEnvDependencies).mock.calls[0]?.[0]
  if (!dependencies) {
    throw new TypeError('Account dependencies were not installed')
  }
  const target = { runtime: 'wsl', wslDistro: 'Ubuntu' } as const
  expect(dependencies.claudeTerminalEnv(target)).toEqual({
    ORCA_CLAUDE_PROFILE_POINTER: 'test-pointer'
  })
  expect(withClaudeProfileTerminalEnv).toHaveBeenCalledWith({}, null, target)
})
