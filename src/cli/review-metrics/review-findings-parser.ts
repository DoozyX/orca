export type FindingBucket = 'patch' | 'nit' | 'decision-needed' | 'defer'

export type ParsedFinding = { id: string; bucket: FindingBucket; round1Miss: boolean }
export type ParsedPrior = { id: string; ruling: string }
export type ParsedFindingsFile = {
  findings: ParsedFinding[]
  priors: ParsedPrior[]
  errors: string[]
}

const ANCHOR = '## Merged findings'
const FINDING_LINE =
  /^(R[0-9I]+\.\d+)\. .+?:\d+ - (?:critical|major|minor) - \[(patch|nit|decision-needed|defer)\] - (.*?) - .*$/
const PRIOR_LINE =
  /^Prior: (R[0-9I]+\.\d+) - (fixed|open|disputed-upheld|disputed-withdrawn)(?: - .*)?$/
const VERDICT_LINE =
  /^VERDICT: (?:clean|fix-needed patch=\d+ decision-needed=\d+ nit=\d+ defer=\d+)$/

function bucketOf(value: string): FindingBucket {
  switch (value) {
    case 'patch':
    case 'nit':
    case 'decision-needed':
    case 'defer':
      return value
    default:
      throw new RangeError(`Unexpected finding bucket ${value}`)
  }
}

export function parseFindingsFile(text: string, path: string): ParsedFindingsFile {
  const result: ParsedFindingsFile = { findings: [], priors: [], errors: [] }
  const lines = text.split(/\r?\n/)
  const anchor = lines.findIndex((line) => line.trim() === ANCHOR)
  if (anchor === -1) {
    result.errors.push(`${path}: missing "${ANCHOR}" anchor`)
    return result
  }
  let verdict = false
  for (const raw of lines.slice(anchor + 1)) {
    const line = raw.trim()
    if (VERDICT_LINE.test(line)) {
      verdict = true
      continue
    }
    if (/^R[0-9I]+\./.test(line)) {
      const match = FINDING_LINE.exec(line)
      if (match) {
        result.findings.push({
          id: match[1],
          bucket: bucketOf(match[2]),
          round1Miss: match[3].includes('round-1-miss')
        })
      } else {
        result.errors.push(`${path}: unparseable line "${line}"`)
      }
    } else if (line.startsWith('Prior:')) {
      const match = PRIOR_LINE.exec(line)
      if (match) {
        result.priors.push({ id: match[1], ruling: match[2] })
      } else {
        result.errors.push(`${path}: unparseable line "${line}"`)
      }
    }
  }
  if (!verdict) {
    result.errors.push(`${path}: missing VERDICT line`)
  }
  return result
}
