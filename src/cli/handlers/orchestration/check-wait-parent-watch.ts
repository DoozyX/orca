export const CHECK_WAIT_PARENT_POLL_MS = 1_000

/**
 * Watches for the parent of a `check --wait` exiting. The host cannot tell an orphaned waiter from
 * a live second client, so the orphan must prove its own death and exit: its socket close is what
 * frees the Run's exclusive waiter. POSIX reparents an orphan to init or a subreaper, so any
 * change of parent pid proves the parent exited.
 */
export function startCheckWaitParentWatch(options: {
  onOrphaned: () => void
  readParentPid?: () => number
  platform?: NodeJS.Platform
}): () => void {
  // Why: Windows never reparents, so an orphan there is unverifiable and keeps its wait.
  if ((options.platform ?? process.platform) === 'win32') {
    return () => {}
  }
  const readParentPid = options.readParentPid ?? (() => process.ppid)
  const parentPid = readParentPid()
  const timer = setInterval(() => {
    if (readParentPid() === parentPid) {
      return
    }
    clearInterval(timer)
    options.onOrphaned()
  }, CHECK_WAIT_PARENT_POLL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
