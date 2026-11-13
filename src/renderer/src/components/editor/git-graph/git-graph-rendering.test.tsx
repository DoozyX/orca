import { workspaceId, local, repo } from './git-graph-workspace.test-fixtures'
// @vitest-environment happy-dom
import { useAppStore } from '@/store'
import { disposeGitGraphHistory } from './git-graph-tab-controllers'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GitGraphTab } from './git-graph-tab'
import * as graphSvg from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitHistoryResult } from '../../../../../shared/git/history/git-history-types'

const ROW_HEIGHT = graphSvg.GIT_HISTORY_GRAPH_METRICS.avatar.rowHeight

const { getHistory, getRefs, getStatus, viewport } = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getRefs: vi.fn(),
  getStatus: vi.fn(),
  viewport: { rows: 20 }
}))
vi.mock('@/runtime/source-control/git/runtime-git-status-client', async (original) => ({
  ...(await original<object>()),
  getRuntimeGitHistory: getHistory,
  getRuntimeGitRefs: getRefs,
  getRuntimeGitStatus: getStatus
}))
vi.mock('@/runtime/source-control/git/runtime-git-diff-client', async (original) => ({
  ...(await original<object>()),
  getRuntimeGitCommitCompare: vi.fn(async () => ({ summary: { status: 'ready' }, entries: [] }))
}))
const container = document.createElement('div')
document.body.appendChild(container)
let root = createRoot(container)
let resize: (() => void) | undefined
const initialState = useAppStore.getState()
beforeEach(() => {
  getStatus.mockReset().mockResolvedValue({ entries: [] })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => viewport.rows * ROW_HEIGHT
  )
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return (
      Number.parseFloat(
        this.firstElementChild?.getAttribute('style')?.match(/height: ([\d.]+)px/)?.[1] ?? '0'
      ) + 48
    )
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {
        if (resize === this.callback) {
          resize = undefined
        }
      }
      unobserve() {}
    }
  )
  useAppStore.setState({
    repos: [repo],
    worktreesByRepo: { r: [local] },
    activeWorktreeId: workspaceId,
    activeWorkspaceExecutionHostId: 'local',
    gitGraphFiltersByWorktree: {}
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(container)
  viewport.rows = 20
  disposeGitGraphHistory(`${workspaceId}::git-graph`)
  useAppStore.setState(initialState, true)
  vi.restoreAllMocks()
})
const result: GitHistoryResult = {
  items: [{ id: 'a', subject: 'subject', message: 'subject', parentIds: [] }],
  hasMore: false,
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  limit: 50
}

const renderTab = () =>
  act(async () =>
    root.render(
      <TooltipProvider>
        <GitGraphTab worktreeId={workspaceId} />
      </TooltipProvider>
    )
  )

it('dims commits by authors outside the picked set until cleared', async () => {
  const authored = (id: string, author: string, authorEmail: string) => ({
    id,
    subject: id,
    message: id,
    parentIds: [],
    author,
    authorEmail
  })
  getHistory.mockReset().mockResolvedValue({
    ...result,
    refs: 'all',
    items: [
      authored('c1', 'Ada Lovelace', 'ada@example.com'),
      authored('c2', 'Grace Hopper', 'grace@example.com'),
      authored('c3', 'Ada Lovelace', 'ADA@example.com')
    ]
  })
  await renderTab()
  const dimmedIds = () =>
    Array.from(container.querySelectorAll('[data-current]'))
      .filter((row) => row.hasAttribute('data-dimmed'))
      .map((row) => row.querySelector('button')!.title)
  expect(dimmedIds()).toEqual([])
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[aria-label="Highlight authors"]')!.click()
  })
  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLElement>('label'))
      .find((label) => label.textContent === 'Ada Lovelace2')!
      .querySelector('button')!
      .click()
  })
  expect(dimmedIds()).toEqual(['c2'])
  await act(async () => {
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent === 'Clear')!
      .click()
  })
  expect(dimmedIds()).toEqual([])
})
