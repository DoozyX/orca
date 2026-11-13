import type { RuntimeStore } from './construction/runtime-store-contract'
import { claudeStructuredAuthPolicyForSettings } from '../claude-accounts/runtime-auth/claude-structured-auth-policy'
import { resolveStructuredCodexAccountKind } from './agent-session/environment/structured-agent-account-home'

type StoreSettings = ReturnType<RuntimeStore['getSettings']>

export function structuredAgentAccountResolvers(getSettings: () => StoreSettings): {
  resolveClaudeAuthPolicy: () => ReturnType<typeof claudeStructuredAuthPolicyForSettings>
  resolveCodexAccountKind: (home: string) => ReturnType<typeof resolveStructuredCodexAccountKind>
} {
  return {
    resolveClaudeAuthPolicy: () => claudeStructuredAuthPolicyForSettings(getSettings()),
    resolveCodexAccountKind: (home) => resolveStructuredCodexAccountKind(home, getSettings())
  }
}
