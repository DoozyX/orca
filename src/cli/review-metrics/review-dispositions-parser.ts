export type DispositionKind = 'fixed' | 'disputed' | 'blocked' | 'nit-fixed' | 'nit-skipped'
export type ParsedDisposition = { id: string; kind: DispositionKind }

const DISPOSITION_LINE =
  /^(R[0-9I]+\.\d+) - (fixed|disputed|blocked|nit-fixed|nit-skipped)(?: - |$)/

function sectionLines(text: string, heading: string): string[] | null {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) {
    return null
  }
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return end === -1 ? rest : rest.slice(0, end)
}

function kindOf(value: string): DispositionKind {
  switch (value) {
    case 'fixed':
    case 'disputed':
    case 'blocked':
    case 'nit-fixed':
    case 'nit-skipped':
      return value
    default:
      throw new RangeError(`Unexpected disposition kind ${value}`)
  }
}

export function parseDispositions(text: string): ParsedDisposition[] {
  const section = sectionLines(text, '## Dispositions')
  if (!section) {
    return []
  }
  return section.flatMap((line) => {
    const match = DISPOSITION_LINE.exec(line.trim())
    return match ? [{ id: match[1], kind: kindOf(match[2]) }] : []
  })
}

/** Null when the `## Escapes` section is absent. */
export function countEscapes(retrospectiveText: string): number | null {
  const section = sectionLines(retrospectiveText, '## Escapes')
  return section ? section.filter((line) => line.startsWith('ESCAPE: ')).length : null
}
