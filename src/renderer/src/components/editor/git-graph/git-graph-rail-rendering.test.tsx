import { workspaceId, local, repo } from './git-graph-workspace.test-fixtures'
// @vitest-environment happy-dom
import { useAppStore } from '@/store'
import { disposeGitGraphHistory } from './git-graph-tab-controllers'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GitGraphTab } from './git-graph-tab'
import { stubGitGraphViewport } from './git-graph-viewport.test-fixtures'
import type { GitHistoryResult } from '../../../../../shared/git/history/git-history-types'

const { getHistory, getRefs, getStatus } = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getRefs: vi.fn(),
  getStatus: vi.fn()
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
// The ref tree still virtualizes with TanStack; render every node.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; getScrollElement: () => HTMLElement | null }) => ({
    getTotalSize: () => options.count * 28,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({ index, start: index * 28 })),
    measureElement: () => {},
    scrollToIndex: (index: number) => {
      const element = options.getScrollElement()
      if (element) {
        element.scrollTop = index * 28
      }
    }
  })
}))
const container = document.createElement('div')
document.body.appendChild(container)
let root = createRoot(container)
const initialState = useAppStore.getState()
beforeEach(() => {
  stubGitGraphViewport(520)
  getStatus.mockReset().mockResolvedValue({ entries: [] })
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

const sha = (n: number) => String(n).padStart(40, '0')
const railRefs = [
  { id: 'refs/heads/a', name: 'a', revision: sha(1) },
  { id: 'refs/heads/b', name: 'b', revision: sha(2) },
  { id: 'refs/heads/x', name: 'x', revision: sha(3) },
  { id: 'refs/tags/v1', name: 'v1', revision: 'commit-120' }
]

async function renderGraphWithRail(refs: typeof railRefs) {
  getRefs.mockReset().mockResolvedValue(refs)
  await act(async () =>
    root.render(
      <TooltipProvider>
        <GitGraphTab worktreeId={workspaceId} />
      </TooltipProvider>
    )
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(container.querySelector('aside button[title="v1"]')).not.toBeNull()
  })
}

it('hides a ref chosen in the rail by asking history for every other ref', async () => {
  getHistory.mockReset().mockImplementation(async (_owner, options) => ({
    ...result,
    refs: options.refs
  }))
  await renderGraphWithRail(railRefs)
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('aside [role="checkbox"][aria-label="Local: x"]')!
      .click()
  )
  expect(getHistory.mock.calls.at(-1)?.[1].refs).toEqual([
    'refs/heads/a',
    'refs/heads/b',
    'refs/tags/v1'
  ])
})

it('selects the commit of a tag older than the first loaded page', async () => {
  const items = Array.from({ length: 300 }, (_, index) => ({
    id: `commit-${index}`,
    subject: `Commit ${index}`,
    message: `Commit ${index}`,
    parentIds: []
  }))
  getHistory.mockReset().mockImplementation(async (_owner, options) => ({
    ...result,
    refs: 'all',
    historyToken: 'pinned',
    items: items.slice(options.skip, options.skip + 50),
    hasMore: options.skip < 250
  }))
  await renderGraphWithRail(railRefs)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('aside button[title="v1"]')!.click()
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(container.querySelector('[data-current="true"]')?.textContent).toContain('Commit 120')
  })
})

it('stops paging for an earlier jump when a second ref is clicked and selects its commit', async () => {
  const items = Array.from({ length: 300 }, (_, index) => ({
    id: `commit-${index}`,
    subject: `Commit ${index}`,
    message: `Commit ${index}`,
    parentIds: []
  }))
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  getHistory.mockReset().mockImplementation(async (_owner, options) => {
    if (options.skip === 50) {
      await held
    }
    return {
      ...result,
      refs: 'all',
      historyToken: 'pinned',
      items: items.slice(options.skip, options.skip + 50),
      hasMore: options.skip < 250
    }
  })
  await renderGraphWithRail([
    ...railRefs,
    { id: 'refs/tags/v2', name: 'v2', revision: 'commit-60' }
  ])
  await act(async () =>
    container.querySelector<HTMLButtonElement>('aside button[title="v1"]')!.click()
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('aside button[title="v2"]')!.click()
  )
  release()
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(container.querySelector('[data-current="true"]')?.textContent).toContain('Commit 60')
  })
  expect(getHistory.mock.calls.map((call) => call[1].skip)).toEqual([0, 50])
})

it('selects the newer jump when an older paging jump wakes while the newer one waits for a filter reload', async () => {
  const items = Array.from({ length: 300 }, (_, index) => ({
    id: `commit-${index}`,
    subject: `Commit ${index}`,
    message: `Commit ${index}`,
    parentIds: []
  }))
  const gate = () => {
    let open!: () => void
    const promise = new Promise<void>((resolve) => {
      open = resolve
    })
    return { promise, open }
  }
  const page = gate()
  const reload = gate()
  useAppStore.setState({
    gitGraphFiltersByWorktree: { [workspaceId]: ['refs/heads/a', 'refs/tags/v1'] }
  })
  getHistory.mockReset().mockImplementation(async (_owner, options) => {
    if (options.refs.includes('refs/heads/b')) {
      await reload.promise
      return { ...result, refs: options.refs, items: items.slice(0, 5), hasMore: false }
    }
    if (options.skip === 50) {
      await page.promise
    }
    return {
      ...result,
      refs: options.refs,
      historyToken: 'pinned',
      items: items.slice(options.skip, options.skip + 50),
      hasMore: options.skip < 250
    }
  })
  await renderGraphWithRail([
    ...railRefs.filter((ref) => ref.name !== 'b'),
    { id: 'refs/heads/b', name: 'b', revision: 'commit-3' }
  ])
  await act(async () =>
    container.querySelector<HTMLButtonElement>('aside button[title="v1"]')!.click()
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('aside button[title="b"]')!.click()
  )
  page.open()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  reload.open()
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(container.querySelector('[data-current="true"]')?.textContent).toContain('Commit 3')
  })
})

it('lists a remote the capped remotes page does not reach by probing remote names', async () => {
  const forkRefs = Array.from({ length: 1000 }, (_, index) => ({
    id: `refs/remotes/fork/b${index}`,
    name: `fork/b${index}`,
    revision: sha(index + 1)
  }))
  const originMain = { id: 'refs/remotes/origin/main', name: 'origin/main', revision: sha(9) }
  const byQuery: Record<string, typeof forkRefs> = {
    'refs/remotes/': forkRefs,
    'refs/remotes/f': forkRefs,
    'refs/remotes/fork/': forkRefs,
    'refs/remotes/o': [originMain],
    'refs/remotes/origin/': [originMain]
  }
  getHistory.mockReset().mockResolvedValue({ ...result, refs: 'all' })
  getRefs.mockReset().mockImplementation(async (_context, query) => byQuery[query] ?? [])
  await act(async () =>
    root.render(
      <TooltipProvider>
        <GitGraphTab worktreeId={workspaceId} />
      </TooltipProvider>
    )
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    const labels = [...container.querySelectorAll('aside button[aria-expanded]')].map(
      (button) => button.textContent
    )
    expect(labels).toEqual(['origin1', 'fork1000+'])
  })
})

it('refuses to hide from All while a group is capped and leaves the filter untouched', async () => {
  const locals = Array.from({ length: 1000 }, (_, index) => ({
    id: `refs/heads/b${index}`,
    name: `b${index}`,
    revision: sha(index + 1)
  }))
  getHistory.mockReset().mockResolvedValue({ ...result, refs: 'all' })
  getRefs
    .mockReset()
    .mockImplementation(async (_context, query) => (query === 'refs/heads/' ? locals : []))
  await act(async () =>
    root.render(
      <TooltipProvider>
        <GitGraphTab worktreeId={workspaceId} />
      </TooltipProvider>
    )
  )
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(container.querySelector('aside [role="checkbox"][aria-label="Local"]')).not.toBeNull()
  })
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('aside [role="checkbox"][aria-label="Local"]')!
      .click()
  )
  expect(container.querySelector('aside [role="status"]')?.textContent).toContain(
    'at most 1,000 chosen branches and tags'
  )
  expect(getHistory.mock.calls.map((call) => call[1].refs)).toEqual(['all'])
})

it('shows a hidden ref before jumping to its commit', async () => {
  useAppStore.setState({ gitGraphFiltersByWorktree: { [workspaceId]: ['refs/heads/a'] } })
  getHistory.mockReset().mockImplementation(async (_owner, options) => ({
    ...result,
    refs: options.refs
  }))
  await renderGraphWithRail(railRefs)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('aside button[title="v1"]')!.click()
  )
  expect(getHistory.mock.calls.at(-1)?.[1].refs).toEqual(['refs/heads/a', 'refs/tags/v1'])
})
