import { tokenizeStartupCommand, type AgentStartupShell } from './tui-agent-startup-shell'

/** The shared Codex daemon inherits one pane's hook credentials for every attached session. */
export function withIndependentCodexLaunch(command: string, shell: AgentStartupShell): string {
  const parsed = tokenizeStartupCommand(command, shell)
  if (!parsed.ok) {
    return command
  }
  const executableIndex = shell === 'powershell' && parsed.tokens[0] === '&' ? 1 : 0
  const executable = parsed.tokens[executableIndex]?.split(/[\\/]/).at(-1)
  if (!executable || !/^codex(?:\.(?:exe|cmd|bat|ps1))?$/i.test(executable)) {
    return command
  }
  if (parsed.spans.some((span, index) => span.divergesFromShell && index !== executableIndex - 1)) {
    return command
  }
  const terminator = parsed.tokens.indexOf('--', executableIndex + 1)
  const options = parsed.tokens.slice(
    executableIndex + 1,
    terminator === -1 ? undefined : terminator
  )
  // An explicit remote server owns its hooks; do not change the user's chosen execution host.
  if (
    options.some(
      (token) => token === '--no-daemon' || token === '--remote' || token.startsWith('--remote=')
    )
  ) {
    return command
  }
  const end = parsed.spans[executableIndex].end
  return `${command.slice(0, end)} --no-daemon${command.slice(end)}`
}
