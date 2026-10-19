import { getLineText } from './cell-geometry'
import type { TerminalDocumentScope } from './document-scope'
import { applyXtermSelection } from './selection-highlight'

/** What counts as one word for select-all and for word seeding. */
const WORD_RE = /[\p{L}\p{N}_./:@~+=?&#%-]/u

export function seedWordSelection(scope: TerminalDocumentScope, col: number, absRow: number) {
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
  if (col >= 0 && col < line.length && WORD_RE.test(line[col])) {
    while (s > 0 && WORD_RE.test(line[s - 1])) {
      s--
    }
    while (e < line.length - 1 && WORD_RE.test(line[e + 1])) {
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
