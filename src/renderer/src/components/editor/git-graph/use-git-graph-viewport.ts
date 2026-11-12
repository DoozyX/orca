import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

const OVERSCAN = 12

function visibleRange(top: number, height: number, rowHeight: number) {
  return {
    first: Math.floor(top / rowHeight),
    last: height > 0 ? Math.ceil((top + height) / rowHeight) - 1 : -1
  }
}

export function useGitGraphViewport(
  count: number,
  getInitialOffset: () => number,
  onOffsetChange: (offset: number) => void,
  rowHeight = 24
) {
  const scroll = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => visibleRange(getInitialOffset(), 0, rowHeight))
  const measured = useRef(range)
  const readRange = useCallback(() => {
    const element = scroll.current
    if (!element) {
      return
    }
    const next = visibleRange(element.scrollTop, element.clientHeight, rowHeight)
    if (measured.current.first === next.first && measured.current.last === next.last) {
      return
    }
    measured.current = next
    return next
  }, [scroll, rowHeight])
  const measure = useCallback(() => {
    const next = readRange()
    if (next) {
      setRange(next)
    }
  }, [readRange])
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element) {
      return
    }
    element.scrollTop = getInitialOffset()
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [getInitialOffset, measure])
  useLayoutEffect(measure, [count, measure])

  const onScroll = useCallback(() => {
    if (scroll.current) {
      onOffsetChange(scroll.current.scrollTop)
    }
    const next = readRange()
    if (next) {
      // Scroll events precede paint; commit newly exposed rows in the same frame.
      flushSync(() => setRange(next))
    }
  }, [onOffsetChange, readRange])
  const reveal = useCallback(
    (index: number) => {
      const element = scroll.current
      if (!element) {
        return
      }
      const start = index * rowHeight
      const end = start + rowHeight
      const max = Math.max(0, element.scrollHeight - element.clientHeight)
      if (end >= element.scrollTop + element.clientHeight) {
        element.scrollTop = index === count - 1 ? max : Math.min(max, end - element.clientHeight)
      } else if (start <= element.scrollTop) {
        element.scrollTop = start
      }
      onOffsetChange(element.scrollTop)
      measure()
    },
    [count, onOffsetChange, measure, rowHeight]
  )
  const lastVisible = Math.min(count - 1, range.last)
  const first = Math.max(0, Math.min(count - 1, range.first) - OVERSCAN)
  const last = range.last < 0 ? -1 : Math.min(count - 1, lastVisible + OVERSCAN)
  const items = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => ({
    index: first + i,
    start: (first + i) * rowHeight
  }))
  return { scroll, items, lastVisible, height: count * rowHeight, onScroll, reveal }
}
