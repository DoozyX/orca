import {
  isLegacyAgentSessionAccountHome,
  type AgentSessionAccountHome
} from '../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'

/** Drop the retired project-group marker during load; the wire schema refuses it. */
function withoutRetiredAccountHomeBinding(home: AgentSessionAccountHome): AgentSessionAccountHome {
  return isLegacyAgentSessionAccountHome(home) ? { variable: home.variable, path: home.path } : home
}

export function withoutRetiredAccountHomeBindings<
  R extends Pick<AgentSessionRecord, 'accountHome' | 'launchedAccount'>
>(record: R): R {
  return {
    ...record,
    accountHome: withoutRetiredAccountHomeBinding(record.accountHome),
    ...(record.launchedAccount
      ? {
          launchedAccount: {
            ...record.launchedAccount,
            accountHome: withoutRetiredAccountHomeBinding(record.launchedAccount.accountHome)
          }
        }
      : {})
  }
}
