import type { GitHistoryResult } from '../../../../../shared/git/history/git-history-types'

export type HistoryView = {
  result?: GitHistoryResult
  error?: string
  loading: boolean
  selectedId?: string
  revealId?: string
  disposed?: boolean
}
