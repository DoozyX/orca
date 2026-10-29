import type { OrchestrationDb } from './orchestration/db'
import { isRecentPresentationDispatch } from './orchestration/db/dispatch-context/dispatch-lookup'
import type { DispatchContextRow, RunRow } from './orchestration/types'

/** Keeps panes whose run is still coordinated from a live pane; an unbound run has no coordinator. */
export function filterLiveRunMembers(
  getRun: (runId: string) => RunRow | null | undefined,
  isPaneConnected: (paneKey: string) => boolean,
  runIdByPaneKey: Map<string, string>
): string[] {
  const liveRunIds = new Set<string>()
  for (const runId of new Set(runIdByPaneKey.values())) {
    const run = getRun(runId)
    if (
      run?.legacy === 0 &&
      run.coordinator_pane_key &&
      isPaneConnected(run.coordinator_pane_key)
    ) {
      liveRunIds.add(runId)
    }
  }
  return [...runIdByPaneKey]
    .filter(([, runId]) => liveRunIds.has(runId))
    .map(([paneKey]) => paneKey)
}

/** The terminal's latest settled dispatch while it is still displayable; older ones go to the callback. */
export function getRecentTerminalDispatch(
  handle: string,
  db: OrchestrationDb | null,
  now: number,
  onSettledPastDisplayWindow?: (dispatch: DispatchContextRow) => void
): DispatchContextRow | undefined {
  const dispatch = db?.getLatestDispatchForTerminal?.(handle)
  if (
    !dispatch?.completed_at ||
    dispatch.status === 'pending' ||
    dispatch.status === 'dispatched'
  ) {
    return undefined
  }
  if (isRecentPresentationDispatch(dispatch, now)) {
    return dispatch
  }
  onSettledPastDisplayWindow?.(dispatch)
  return undefined
}
