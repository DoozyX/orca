export const GIT_HISTORY_WIP_ID_PREFIX = 'wip:'

export function gitHistoryWipId(worktreeId: string): string {
  return `${GIT_HISTORY_WIP_ID_PREFIX}${worktreeId}`
}

export function isGitHistoryWipId(id: string): boolean {
  return id.startsWith(GIT_HISTORY_WIP_ID_PREFIX)
}
