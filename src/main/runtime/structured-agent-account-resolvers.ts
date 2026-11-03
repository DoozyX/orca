import type { RuntimeStore } from './runtime-store-contract'

type StoreSettings = ReturnType<RuntimeStore['getSettings']>
import { claudeStructuredAuthPolicyForSettings } from '../claude-accounts/claude-structured-auth-policy'
import {
  claudeHomeBindingReader,
  type ClaudeHomeBindingCatalogSource
} from '../claude/claude-structured-account-home'
import { resolveStructuredCodexAccountKind } from './structured-agent-account-home'

export function structuredAgentAccountResolvers(
  getSettings: () => StoreSettings,
  getBindingCatalog: () => ClaudeHomeBindingCatalogSource
): {
  resolveClaudeAuthPolicy: () => ReturnType<typeof claudeStructuredAuthPolicyForSettings>
  resolveCodexAccountKind: (home: string) => ReturnType<typeof resolveStructuredCodexAccountKind>
  readClaudeHomeBinding: ReturnType<typeof claudeHomeBindingReader>
} {
  return {
    resolveClaudeAuthPolicy: () => claudeStructuredAuthPolicyForSettings(getSettings()),
    resolveCodexAccountKind: (home) => resolveStructuredCodexAccountKind(home, getSettings()),
    // Read per acquisition from the catalog the create path reads, so a chat created before its group was bound is told rather than left on the old account.
    readClaudeHomeBinding: claudeHomeBindingReader(getBindingCatalog)
  }
}
