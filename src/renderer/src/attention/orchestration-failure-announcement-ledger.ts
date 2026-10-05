// Why: a renderer reload forgets these, which costs at most one repeated failure banner.
const announcedFailedDispatchIds = new Set<string>()
const MAX_ANNOUNCED_FAILED_DISPATCHES = 500

export function getAnnouncedOrchestrationFailures(): ReadonlySet<string> {
  return announcedFailedDispatchIds
}

export function recordOrchestrationFailureAnnouncement(dispatchId: string): void {
  announcedFailedDispatchIds.add(dispatchId)
  if (announcedFailedDispatchIds.size > MAX_ANNOUNCED_FAILED_DISPATCHES) {
    const oldest = announcedFailedDispatchIds.values().next()
    if (!oldest.done) {
      announcedFailedDispatchIds.delete(oldest.value)
    }
  }
}

export function resetOrchestrationFailureAnnouncementsForTest(): void {
  announcedFailedDispatchIds.clear()
}
