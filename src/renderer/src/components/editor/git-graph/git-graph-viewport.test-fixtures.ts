import { vi } from 'vitest'

// happy-dom has no layout, so give the scroll pane a fixed height and its content a real height.
export function stubGitGraphViewport(clientHeight: number): void {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    const child = this.firstElementChild
    return child instanceof HTMLElement ? Number.parseFloat(child.style.height || '0') : 0
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
}
