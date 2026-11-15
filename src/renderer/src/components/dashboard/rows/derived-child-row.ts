import type { DashboardAgentRow } from './dashboard-agent-row'

/** Rows derived from a parent's status (subagents, monitored work) have no pane of their own. */
export function isDerivedChildRow(row: Pick<DashboardAgentRow, 'rowSource'>): boolean {
  return row.rowSource === 'subagent' || row.rowSource === 'monitored-work'
}
