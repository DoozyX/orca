import type { AgentSessionStatusEvent } from '../../../../shared/agent-session/agent-session-wire'
import type { Tab } from '../../../../shared/tab-types'
import type { TerminalTab } from '../../../../shared/workspace-layout/terminal-tab-types'

export type SubscribeAgentSessionStatus = (
  target: unknown,
  listener: (event: AgentSessionStatusEvent) => void
) => Promise<{ unsubscribe: () => void }>

export const structuredTab = {
  id: 'structured-tab-1',
  worktreeId: 'wt-1',
  groupId: 'group-1',
  contentType: 'agent-session',
  entityId: 'session-1',
  label: 'Codex Chat',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0,
  isPinned: false,
  agentSessionAgent: 'codex'
} satisfies Tab

export const subagentParentTab: TerminalTab = {
  id: 'structured-tab-1',
  ptyId: null,
  worktreeId: 'wt-1',
  title: 'Codex Chat',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
}
