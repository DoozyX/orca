import { describe, expect, it } from 'vitest'
import { buildAgentResumeStartupPlan, buildAgentStartupPlan } from './tui-agent-startup'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'

const hosts = [
  { platform: 'darwin', shell: 'posix', isRemote: false },
  { platform: 'linux', shell: 'posix', isRemote: true },
  { platform: 'linux', shell: 'posix', isRemote: false },
  { platform: 'win32', shell: 'powershell', isRemote: false },
  { platform: 'win32', shell: 'cmd', isRemote: false }
] as const

describe('Codex pane ownership', () => {
  it.each(hosts)(
    'keeps new and empty launches independent on $platform/$shell (remote=$isRemote)',
    (host) => {
      const args = { agent: 'codex' as const, cmdOverrides: {}, ...host }
      const fresh = buildAgentStartupPlan({ ...args, prompt: 'fix sidebar status' })
      const empty = buildAgentStartupPlan({ ...args, prompt: '', allowEmptyPromptLaunch: true })
      for (const plan of [fresh, empty]) {
        expect(plan).not.toBeNull()
        const parsed = tokenizeStartupCommand(plan!.launchCommand, host.shell)
        expect(parsed.ok && parsed.tokens.slice(0, 2)).toEqual(['codex', '--no-daemon'])
        expect(plan!.launchConfig.agentCommand).toBe('codex --no-daemon')
      }
    }
  )

  it.each(hosts)('keeps saved pre-daemon sessions independent on $platform/$shell', (host) => {
    const plan = buildAgentResumeStartupPlan({
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'saved-session' },
      cmdOverrides: {},
      agentCommand: 'codex --profile work',
      ...host
    })
    expect(plan).not.toBeNull()
    const parsed = tokenizeStartupCommand(plan!.launchCommand, host.shell)
    expect(parsed.ok && parsed.tokens).toEqual([
      'codex',
      '--no-daemon',
      '--profile',
      'work',
      'resume',
      'saved-session'
    ])
    expect(plan!.launchConfig.agentCommand).toBe('codex --no-daemon --profile work')
  })

  it('does not duplicate an explicit isolation flag on resume', () => {
    const plan = buildAgentResumeStartupPlan({
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'saved-session' },
      cmdOverrides: {},
      agentCommand: 'codex --no-daemon --profile work',
      platform: 'linux'
    })
    expect(plan?.launchCommand).toBe("codex --no-daemon --profile work 'resume' 'saved-session'")
  })
})

describe('Codex launch overrides', () => {
  it('does not duplicate an isolation flag supplied through agent arguments', () => {
    const plan = buildAgentStartupPlan({
      agent: 'codex',
      prompt: 'hello',
      cmdOverrides: {},
      platform: 'linux',
      agentArgs: '--no-daemon'
    })
    const parsed = tokenizeStartupCommand(plan!.launchCommand, 'posix')
    expect(parsed.ok && parsed.tokens).toEqual(['codex', '--no-daemon', 'hello'])
  })

  it('preserves an explicitly selected remote server in agent arguments', () => {
    const plan = buildAgentStartupPlan({
      agent: 'codex',
      prompt: 'hello',
      cmdOverrides: {},
      platform: 'linux',
      agentArgs: '--remote unix:///chosen/server.sock'
    })
    expect(plan?.launchCommand).not.toContain('--no-daemon')
  })
})

describe('Codex command syntax', () => {
  it.each([
    {
      shell: 'posix',
      command: "'/opt/Codex CLI/codex' --profile work",
      expected: "'/opt/Codex CLI/codex' --no-daemon --profile work"
    },
    {
      shell: 'powershell',
      command: '& "C:\\Program Files\\Codex\\codex.exe" --profile work',
      expected: '& "C:\\Program Files\\Codex\\codex.exe" --no-daemon --profile work'
    },
    {
      shell: 'cmd',
      command: '"C:\\Program Files\\Codex\\codex.cmd" --profile work',
      expected: '"C:\\Program Files\\Codex\\codex.cmd" --no-daemon --profile work'
    },
    {
      shell: 'posix',
      command: 'codex -- --no-daemon',
      expected: 'codex --no-daemon -- --no-daemon'
    },
    { shell: 'posix', command: 'custom-codex-wrapper', expected: 'custom-codex-wrapper' },
    {
      shell: 'posix',
      command: 'codex --remote=unix:///chosen/server.sock',
      expected: 'codex --remote=unix:///chosen/server.sock'
    }
  ] as const)('preserves $shell syntax for $command', ({ shell, command, expected }) => {
    const plan = buildAgentResumeStartupPlan({
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'saved-session' },
      cmdOverrides: {},
      agentCommand: command,
      platform: 'linux',
      shell
    })
    expect(plan?.launchConfig.agentCommand).toBe(expected)
  })
})
