import {
  activateGitGraphWorkspace,
  gitGraphOwnerKey,
  switchGitGraphWorkspace
} from './git-graph-workspace-navigation'
import { createStore } from 'zustand/vanilla'
import { shallow } from 'zustand/shallow'
import { useAppStore } from '@/store'
import {
  gitGraphRuntimeContext,
  gitGraphScope,
  gitGraphScopeInputs,
  GIT_GRAPH_REFRESH_EVENT
} from '@/lib/git-graph-tab'
import { getRuntimeGitHistory } from '@/runtime/source-control/git/runtime-git-status-client'
import { translate } from '@/i18n/i18n'
import { adoptResolvedGitGraphRefs } from './git-graph-resolved-refs'
import {
  GIT_HISTORY_DEFAULT_LIMIT,
  GIT_HISTORY_MAX_LIMIT,
  type GitHistoryRefs,
  type GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'
import type { HistoryView } from './git-graph-history-view'
import type { ExecutionHostId } from '../../../../../shared/execution-host'
import { isGitGraphSelectionLoaded, resolveGitGraphSelection } from './git-graph-wip-items'

const noAuthors: ReadonlySet<string> = new Set()
const controllers = new Map<string, GitGraphHistoryController>()
const filterFor = (worktreeId: string) =>
  useAppStore.getState().gitGraphFiltersByWorktree?.[worktreeId] ?? 'all'

export function gitGraphHistoryForTab(worktreeId: string): GitGraphHistoryController {
  const id = `${worktreeId}::git-graph`
  let controller = controllers.get(id)
  if (!controller) {
    controller = new GitGraphHistoryController(worktreeId)
    controllers.set(id, controller)
  }
  return controller
}

export function disposeGitGraphHistory(tabId: string): void {
  controllers.get(tabId)?.dispose()
  controllers.delete(tabId)
}

export class GitGraphHistoryController {
  readonly view = createStore<HistoryView>(() => ({
    loading: false,
    authorHighlight: noAuthors
  }))
  scrollOffset = 0
  graphWidth = 132
  fileSort: 'asc' | 'desc' = 'asc'
  private scope: ReturnType<typeof gitGraphScope>
  private filter: GitHistoryRefs
  executionHostId: ExecutionHostId | undefined
  private navigation = 0
  private generation = 0
  private dirty = true
  private initial = true
  private visible = 0
  private disposed = false
  private pending?: Promise<GitHistoryResult | undefined>
  private unsubscribe?: () => void

  constructor(readonly worktreeId: string) {
    const state = useAppStore.getState()
    const file = state.openFiles.find((file) => file.id === `${worktreeId}::git-graph`)
    this.executionHostId =
      file?.operationProvenance?.generation.route.executionHostId ??
      gitGraphScope(worktreeId, state)?.route.executionHostId ??
      undefined
    this.scope = gitGraphScope(worktreeId, state, this.executionHostId)
    this.filter = filterFor(worktreeId)
  }

  attach(): () => void {
    this.visible++
    if (!this.unsubscribe) {
      this.unsubscribe = useAppStore.subscribe((state, previous) => {
        if (
          state.openFiles === previous.openFiles &&
          state.gitGraphFiltersByWorktree?.[this.worktreeId] ===
            previous.gitGraphFiltersByWorktree?.[this.worktreeId] &&
          shallow(gitGraphScopeInputs(state), gitGraphScopeInputs(previous))
        ) {
          return
        }
        this.synchronize()
      })
      window.addEventListener(GIT_GRAPH_REFRESH_EVENT, this.onRefresh)
    }
    this.synchronize()
    if (this.dirty) {
      void this.retrieve(false, this.initial)
    }
    return () => {
      this.visible--
    }
  }

  private synchronize(): void {
    const state = useAppStore.getState()
    const file = state.openFiles.find((file) => file.id === `${this.worktreeId}::git-graph`)
    this.executionHostId =
      file?.operationProvenance?.generation.route.executionHostId ?? this.executionHostId
    const scope = gitGraphScope(this.worktreeId, state, this.executionHostId)
    const filter = filterFor(this.worktreeId)
    if (
      gitGraphOwnerKey(scope) === gitGraphOwnerKey(this.scope) &&
      (filter === this.filter || JSON.stringify(filter) === JSON.stringify(this.filter))
    ) {
      return
    }
    this.scope = scope
    this.filter = filter
    this.scrollOffset = 0
    this.view.setState({ loading: false, authorHighlight: this.authorHighlight }, true)
    this.invalidate()
  }

  private invalidate(): void {
    this.generation++
    this.pending = undefined
    this.dirty = true
    if (this.visible) {
      void this.retrieve(false, this.initial)
    }
  }

  private onRefresh = (event: Event): void => {
    if (event instanceof CustomEvent && event.detail === this.worktreeId) {
      this.invalidate()
    }
  }

  dispose(): void {
    this.disposed = true
    this.view.setState({ disposed: true, loading: false })
    this.generation++
    this.unsubscribe?.()
    window.removeEventListener(GIT_GRAPH_REFRESH_EVENT, this.onRefresh)
  }

  private liveGuard(): () => boolean {
    const generation = this.generation
    return () => !this.disposed && generation === this.generation
  }
  switchToWorkspace = (refId: string): Promise<void> =>
    switchGitGraphWorkspace(this.scope, refId, this.liveGuard())
  activateWorkspace = (worktreeId: string): void =>
    activateGitGraphWorkspace(this.scope, worktreeId, this.liveGuard())

  get authorHighlight(): ReadonlySet<string> {
    return this.view.getState().authorHighlight
  }
  setAuthorHighlight = (keys: Iterable<string>): void => {
    this.view.setState({ authorHighlight: new Set(keys) })
  }

  select = (selectedId: string): void => {
    this.navigation++
    this.view.setState({ selectedId, revealId: undefined })
  }
  clearReveal = (): void => this.view.setState({ revealId: undefined })
  refresh = (): Promise<GitHistoryResult | undefined> => {
    this.generation++
    this.pending = undefined
    return this.retrieve(false, true)
  }
  loadMore = (): Promise<GitHistoryResult | undefined> => this.retrieve(true)

  reveal = async (id: string): Promise<number> => {
    const generation = this.generation
    const navigation = ++this.navigation
    this.clearReveal()
    const current = () =>
      !this.disposed && generation === this.generation && navigation === this.navigation
    // -2: the history was reloaded under this jump, so the caller may retry; -1: superseded or closed.
    const aborted = () => (!this.disposed && navigation === this.navigation ? -2 : -1)
    while (this.pending && current()) {
      await this.pending
    }
    if (!current()) {
      return aborted()
    }
    let result = this.view.getState().result
    if (!result?.items.some((item) => item.id === id) && result?.hasMore) {
      result = await this.retrieve(true, false, id, navigation)
    }
    if (!current()) {
      return aborted()
    }
    const index = result?.items.findIndex((item) => item.id === id) ?? -1
    if (index !== -1) {
      this.view.setState({ selectedId: id, revealId: id })
    }
    return index
  }

  private retrieve(
    append = false,
    wakeWslDistro = false,
    revealId?: string,
    navigation?: number
  ): Promise<GitHistoryResult | undefined> {
    if (this.disposed) {
      return Promise.resolve(undefined)
    }
    if (this.pending) {
      return this.pending
    }
    const previous = this.view.getState().result
    const context = this.scope
    if (!context || (append && !previous?.hasMore)) {
      return Promise.resolve(context ? previous : undefined)
    }
    const targetDepth = previous?.items.length ?? 0
    const filter = this.filter
    const current = this.liveGuard()
    this.initial = false
    this.dirty = false
    this.view.setState({ loading: true, error: undefined })
    const run = async (): Promise<GitHistoryResult | undefined> => {
      let accumulated = append ? previous : undefined
      let items = [...(accumulated?.items ?? [])]
      let ids = new Set(items.map((item) => item.id))
      let recovered = false
      let error: string | undefined
      try {
        do {
          const page = await getRuntimeGitHistory(
            gitGraphRuntimeContext(this.worktreeId, context),
            {
              refs: filter,
              limit: revealId ? GIT_HISTORY_MAX_LIMIT : GIT_HISTORY_DEFAULT_LIMIT,
              historyToken: accumulated?.historyToken,
              skip: items.length,
              wakeWslDistro
            }
          )
          if (!current()) {
            return undefined
          }
          if (page.historyChanged) {
            if (recovered) {
              throw new Error(
                translate(
                  'gitGraph.historyChanged',
                  'History changed again. Refresh the Git Graph to try again.'
                )
              )
            }
            recovered = true
            accumulated = undefined
            items = []
            ids = new Set()
            continue
          }
          const count = items.length
          for (const item of page.items) {
            if (!ids.has(item.id)) {
              ids.add(item.id)
              items.push(item)
            }
          }
          accumulated = { ...page, items }
          if (
            (!revealId &&
              items.length >= targetDepth &&
              (count >= targetDepth ||
                isGitGraphSelectionLoaded(ids, this.view.getState().selectedId))) ||
            (revealId && (navigation !== this.navigation || ids.has(revealId))) ||
            !page.hasMore ||
            items.length === count
          ) {
            break
          }
        } while (current())
      } catch (cause) {
        error =
          cause instanceof Error
            ? cause.message
            : translate('gitGraph.loadFailed', 'Failed to load Git history')
      }
      if (!current()) {
        return undefined
      }
      const result = error !== undefined ? previous : (accumulated ?? previous)
      const selection = this.view.getState().selectedId
      const selectedId = resolveGitGraphSelection(result?.items, selection)
      const selectionGone = selection !== undefined && selection !== selectedId
      if (selectionGone) {
        this.scrollOffset = 0
      }
      this.view.setState({
        result,
        error,
        loading: false,
        selectedId,
        ...(selectionGone ? { revealId: selectedId } : {})
      })
      adoptResolvedGitGraphRefs(this.worktreeId, filter, result)
      return result
    }
    const pending = run().finally(() => {
      if (this.pending === pending) {
        this.pending = undefined
      }
    })
    this.pending = pending
    return pending
  }
}
