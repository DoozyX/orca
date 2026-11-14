// @vitest-environment happy-dom
import { useAppStore } from '@/store'
import { disposeGitGraphHistory } from './git-graph-tab-controllers'
import type { Worktree } from '../../../../../shared/worktree/types'
import type { Repo } from '../../../../../shared/repo-types'
import type { GitStatusEntry } from '../../../../../shared/git/status/git-status-types'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GitGraphTab } from './git-graph-tab'
import { stubGitGraphViewport } from './git-graph-viewport.test-fixtures'
import type { GitHistoryResult } from '../../../../../shared/git/history/git-history-types'

const { getHistory, getStatus } = vi.hoisted(() => ({ getHistory: vi.fn(), getStatus: vi.fn() }))
vi.mock('@/runtime/source-control/git/runtime-git-status-client', async (original) => ({
  ...(await original<object>()),
  getRuntimeGitHistory: getHistory,
  getRuntimeGitRefs: vi.fn(async () => []),
  getRuntimeGitStatus: getStatus
}))
vi.mock('@/runtime/source-control/git/runtime-git-diff-client', async (original) => ({
  ...(await original<object>()),
  getRuntimeGitCommitCompare: vi.fn(async () => ({ summary: { status: 'ready' }, entries: [] }))
}))

const container = document.createElement('div')
document.body.appendChild(container)
let root = createRoot(container)
const initialState = useAppStore.getState()
const workspaceId = 'r::/repo'
const worktree = (path: string, branch: string): Worktree => ({
  id: `r::${path}`,
  repoId: 'r',
  path,
  branch,
  hostId: 'local',
  head: 'a',
  isBare: false,
  isMainWorktree: path === '/repo',
  displayName: path.slice(1),
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
})
const local = worktree('/repo', 'refs/heads/main')
const repo: Repo = {
  id: 'r',
  path: '/repo',
  displayName: 'repo',
  badgeColor: '',
  addedAt: 0,
  executionHostId: 'local'
}
const result: GitHistoryResult = {
  items: [{ id: 'a', subject: 'subject', message: 'subject', parentIds: [] }],
  hasMore: false,
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  limit: 50,
  refs: 'all'
}
const edit = (path: string, area: 'staged' | 'unstaged'): GitStatusEntry => ({
  path,
  area,
  status: 'modified'
})
// Paths that currently have edits; tests change it to make a workspace clean.
let dirtyPaths = new Set<string>()

beforeEach(() => {
  stubGitGraphViewport(520)
  dirtyPaths = new Set(['/other', '/detached'])
  getHistory.mockReset().mockResolvedValue(result)
  getStatus.mockReset().mockImplementation(async (context: { worktreePath: string }) => ({
    entries: dirtyPaths.has(context.worktreePath)
      ? [edit('src/a.ts', 'unstaged'), edit('b.ts', 'staged')]
      : [],
    head: 'a'
  }))
  useAppStore.setState({
    repos: [repo],
    worktreesByRepo: {
      r: [
        local,
        worktree('/other', 'refs/heads/feature'),
        worktree('/detached', ''),
        worktree('/clean', 'refs/heads/clean')
      ]
    },
    activeWorktreeId: workspaceId,
    activeWorkspaceExecutionHostId: 'local',
    gitGraphFiltersByWorktree: {}
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(container)
  disposeGitGraphHistory(`${workspaceId}::git-graph`)
  useAppStore.setState(initialState, true)
  vi.restoreAllMocks()
})

const wipRows = () => container.querySelectorAll<HTMLElement>('[data-wip]')
async function renderGraph() {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <GitGraphTab worktreeId={workspaceId} />
      </TooltipProvider>
    )
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(wipRows()).toHaveLength(2)
  })
}
const selectWip = (worktreeId: string) =>
  act(async () =>
    Array.from(wipRows())
      .find((row) => row.dataset.wip === worktreeId)!
      .click()
  )

it("opens a file from another workspace's WIP row in the graph's workspace", async () => {
  const openDiff = vi.fn()
  useAppStore.setState({ openDiff })
  await renderGraph()
  await selectWip('r::/other')
  await act(async () =>
    Array.from(container.querySelectorAll('aside button'))
      .find((button) => button.getAttribute('title') === 'src/a.ts')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  expect(openDiff).toHaveBeenCalledWith(
    'r::/other',
    '/other/src/a.ts',
    'src/a.ts',
    'typescript',
    false,
    expect.objectContaining({ placementWorkspaceId: workspaceId })
  )
})

it('switches to a detached workspace by id', async () => {
  const setActiveWorktree = vi.fn()
  useAppStore.setState({ setActiveWorktree })
  await renderGraph()
  await selectWip('r::/detached')
  await act(async () =>
    container.querySelector<HTMLElement>('[data-testid="git-graph-wip-switch"]')!.click()
  )
  expect(setActiveWorktree.mock.calls[0]?.slice(0, 2)).toEqual(['r::/detached', 'local'])
})

it('shows the newest commit when the selected WIP row goes away', async () => {
  await renderGraph()
  await selectWip('r::/other')
  expect(container.querySelector('[data-testid="git-graph-wip-heading"]')).not.toBeNull()
  dirtyPaths = new Set(['/detached'])
  await act(async () =>
    container.querySelector<HTMLElement>('button[aria-label="Refresh commits"]')!.click()
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(wipRows()).toHaveLength(1)
  })
  expect(container.querySelector('[data-testid="git-graph-wip-heading"]')).toBeNull()
  expect(container.querySelector('[data-testid="git-graph-commit-message"]')).not.toBeNull()
})

it('does not page deeper on refresh while a WIP row is selected', async () => {
  // A full pane, so viewport paging stays out of the count.
  const filler = Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`,
    subject: `c${i}`,
    message: `c${i}`,
    parentIds: []
  }))
  getHistory.mockResolvedValue({ ...result, items: [...result.items, ...filler], hasMore: true })
  await renderGraph()
  await selectWip('r::/other')
  getHistory.mockClear()
  await act(async () =>
    container.querySelector<HTMLElement>('button[aria-label="Refresh commits"]')!.click()
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(getHistory).toHaveBeenCalled()
  })
  await act(async () => {})
  expect(getHistory).toHaveBeenCalledTimes(1)
})
