import { getLineText } from './cell-geometry'
import type { TerminalDocumentScope } from './document-scope'
import type { TerminalDocumentLine } from './document-terminal-shape'
import { applyXtermSelection } from './selection-highlight'
import { isTerminalWordSeparator } from '../../../../src/shared/terminal-word-separator'

// Match xterm double-click: a space grows over spaces, anything else over non-separators.
function joinsPressedWord(pressed: string, text: string) {
  return pressed === ' ' ? text === ' ' : !isTerminalWordSeparator(text)
}

type SelectionUnit = { text: string; start: number; end: number }

function selectionUnits(line: TerminalDocumentLine, cols: number): SelectionUnit[] | null {
  const cells: SelectionUnit[] = []
  for (let col = 0; col < Math.min(cols, line.length);) {
    const cell = line.getCell?.(col)
    if (!cell?.getChars || !cell.getWidth) {
      return null
    }
    const width = cell.getWidth()
    if (width <= 0) {
      col++
      continue
    }
    cells.push({ text: cell.getChars() || ' ', start: col, end: col + width - 1 })
    col += width
  }
  if (typeof Intl.Segmenter !== 'function') {
    return cells
  }
  // A grapheme can occupy several xterm cells; UTF-16 length is never its cell width.
  const columns = cells.flatMap((cell) => Array.from({ length: cell.text.length }, () => cell))
  const text = cells.map((cell) => cell.text).join('')
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    (part) => ({
      text: part.segment,
      start: columns[part.index].start,
      end: columns[part.index + part.segment.length - 1].end
    })
  )
}

function wordCellRange(line: TerminalDocumentLine | undefined, col: number, cols: number) {
  const units = line && selectionUnits(line, cols)
  const index = units?.findIndex((unit) => unit.start <= col && col <= unit.end) ?? -1
  if (!units || index < 0) {
    return null
  }
  const pressed = units[index].text
  let start = index
  let end = index
  while (start > 0 && joinsPressedWord(pressed, units[start - 1].text)) {
    start--
  }
  while (end + 1 < units.length && joinsPressedWord(pressed, units[end + 1].text)) {
    end++
  }
  return { start: units[start].start, end: units[end].end }
}

export function seedWordSelection(scope: TerminalDocumentScope, col: number, absRow: number) {
  const cells = wordCellRange(scope.term?.buffer.active.getLine(absRow), col, scope.term?.cols ?? 0)
  if (cells) {
    scope.sel = {
      anchor: { col: cells.start, row: absRow },
      focus: { col: cells.end, row: absRow },
      activeHandle: null
    }
    applyXtermSelection(scope)
    return
  }
  // Small host/test seams can expose text only; keep their existing ASCII behavior.
  const line = getLineText(scope, absRow)
  if (!line) {
    scope.sel = {
      anchor: { col: col, row: absRow },
      focus: { col: col, row: absRow },
      activeHandle: null
    }
    applyXtermSelection(scope)
    return
  }
  let s = col
  let e = col
  if (col >= 0 && col < line.length) {
    while (s > 0 && joinsPressedWord(line[col], line[s - 1])) {
      s--
    }
    while (e < line.length - 1 && joinsPressedWord(line[col], line[e + 1])) {
      e++
    }
  }
  scope.sel = {
    anchor: { col: s, row: absRow },
    focus: { col: e, row: absRow },
    activeHandle: null
  }
  applyXtermSelection(scope)
}
