export type FindingBucket = 'patch' | 'nit' | 'decision-needed' | 'defer'

export type FindingSeverity = 'critical' | 'major' | 'minor'
export type ParsedFinding = {
  id: string
  severity: FindingSeverity
  bucket: FindingBucket
  round1Miss: boolean
  /** The finding's indented `class:` / `evidence:` continuation lines. */
  continuation: string[]
}
export type VerdictCounts = Record<FindingBucket, number>
export type ParsedVerdict = { outcome: 'clean' } | { outcome: 'fix-needed'; counts: VerdictCounts }
export type ParsedPrior = { id: string; ruling: string }
export type ParsedFindingsFile = {
  findings: ParsedFinding[]
  priors: ParsedPrior[]
  verdict: ParsedVerdict | null
  /** Text after the first `Checked: tests full` on its line, or null when no such line exists. */
  fullSuiteCheck: string | null
  errors: string[]
}

const ANCHOR = '## Merged findings'
const FINDING_LINE =
  /^(R[0-9I]+\.\d+)\. (?:(?! - ).)+? - (critical|major|minor) - \[(patch|nit|decision-needed|defer)\] - (.*?) - .*$/
const PRIOR_LINE =
  /^Prior: (R[0-9I]+\.\d+) - (fixed|open|disputed-upheld|disputed-withdrawn)(?: - .*)?$/
const VERDICT_LINE =
  /^VERDICT: (?:clean|fix-needed patch=(\d+) decision-needed=(\d+) nit=(\d+) defer=(\d+))$/
const FINDING_ID_PREFIX = /^R[0-9I]+\.\d+\. /
const PRIOR_ID_PREFIX = /^R[0-9I]+\.\d+(?: |$)/
const PRIOR_RULINGS = ['fixed', 'open', 'disputed-upheld', 'disputed-withdrawn']
const SEVERITIES = ['critical', 'major', 'minor']
const BUCKET_TAG = /^\[(?:patch|nit|decision-needed|defer)\]$/
const FULL_SUITE_CHECK = /^Checked: tests full\b(.*)$/
// Why: a line opening like a finding head (list marker, numbered item or ID token, then a bracketed bucket, or `<file>:<line> - <severity> - `) must parse or fail loudly; quoting lines stay ignorable.
const FINDING_LIKE = [
  /^R(?:\d+|[A-Z])?\./,
  /^(?:[-*]|\d+\.|[A-Za-z]+\d+(?:\.\d+)*\.?)\s.*\[(?:patch|nit|decision-needed|defer)\]/i,
  /^[^:]*:\d+ - (?:critical|major|minor) - /i
]
const PRIOR_LIKE = /^prior(?:\s*(?::|[-–—(])|\s+R[0-9I]+\.)/i

function findingError(line: string): string {
  const [idToken] = line.split(' ')
  if (!FINDING_ID_PREFIX.test(line)) {
    if (/^R(?:\d+|[A-Z])?\./.test(line) && line.split(/ [-\u2013\u2014] /).length < 3) {
      return 'line starts like a finding ID but is not a finding; put explanations in a "Checked:" line'
    }
    return `finding line has ID "${idToken}"; expected "R<r>.<n>." with <r> 1-3 or I, then a space`
  }
  const fields = line.slice(line.indexOf(' ') + 1).split(' - ')
  if (fields.length > 1 && !SEVERITIES.includes(fields[1])) {
    return `finding line has severity "${fields[1]}"; expected critical|major|minor`
  }
  if (fields.length > 2 && !BUCKET_TAG.test(fields[2])) {
    return `finding line has bucket "${fields[2]}"; expected [patch|nit|decision-needed|defer]`
  }
  return 'finding line needs " - " (hyphen) between location, severity, [bucket], tags and text'
}

function priorError(line: string): string {
  const rest = line.startsWith('Prior: ') ? line.slice('Prior: '.length) : null
  if (rest === null) {
    return 'malformed Prior line; expected "Prior: R<r>.<n> - fixed|open|disputed-upheld|disputed-withdrawn - <reason>"'
  }
  const fields = rest.split(' - ')
  if (!PRIOR_ID_PREFIX.test(rest)) {
    const rangeNote = /[-,]/.test(fields[0])
      ? '; ranges such as R1.1-R1.11 and lists are not allowed'
      : ''
    return `Prior line has ID "${fields[0]}"; expected one R<r>.<n> followed by " - "${rangeNote}`
  }
  if (fields.length < 2) {
    return 'Prior line needs " - " (hyphen) between ID, ruling and reason'
  }
  return `Prior line has ruling "${fields[1]}"; expected ${PRIOR_RULINGS.join('|')} (a coordinator-deferred item is open)`
}

function severityOf(value: string): FindingSeverity {
  switch (value) {
    case 'critical':
    case 'major':
    case 'minor':
      return value
    default:
      throw new RangeError(`Unexpected finding severity ${value}`)
  }
}

function verdictOf(match: RegExpExecArray): ParsedVerdict {
  if (match[1] === undefined) {
    return { outcome: 'clean' }
  }
  return {
    outcome: 'fix-needed',
    counts: {
      patch: Number(match[1]),
      'decision-needed': Number(match[2]),
      nit: Number(match[3]),
      defer: Number(match[4])
    }
  }
}

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
  const result: ParsedFindingsFile = {
    findings: [],
    priors: [],
    verdict: null,
    fullSuiteCheck: null,
    errors: []
  }
  const lines = text.split(/\r?\n/)
  const anchor = lines.findIndex((line) => line.trim() === ANCHOR)
  if (anchor === -1) {
    result.errors.push(`${path}: missing "${ANCHOR}" anchor`)
    return result
  }
  let latest: ParsedFinding | null = null
  let malformedVerdict = false
  for (const raw of lines.slice(anchor + 1)) {
    const line = raw.trim()
    const verdict = VERDICT_LINE.exec(line)
    if (verdict) {
      result.verdict = verdictOf(verdict)
      continue
    }
    if (line.startsWith('VERDICT:')) {
      malformedVerdict = true
      result.errors.push(
        `${path}: malformed VERDICT line "${line}"; expected "VERDICT: clean" or "VERDICT: fix-needed patch=<n> decision-needed=<n> nit=<n> defer=<n>"`
      )
      continue
    }
    const suite = FULL_SUITE_CHECK.exec(line)
    if (suite && result.fullSuiteCheck === null) {
      result.fullSuiteCheck = suite[1].trim()
    }
    const structural = PRIOR_LIKE.test(line) || FINDING_LIKE.some((pattern) => pattern.test(line))
    if (latest !== null && /^\s/.test(raw) && line.length > 0 && !structural) {
      latest.continuation.push(line)
      continue
    }
    latest = null
    if (PRIOR_LIKE.test(line)) {
      const match = PRIOR_LINE.exec(line)
      if (match) {
        result.priors.push({ id: match[1], ruling: match[2] })
      } else {
        result.errors.push(`${path}: ${priorError(line)}: "${line}"`)
      }
    } else if (FINDING_LIKE.some((pattern) => pattern.test(line))) {
      const match = FINDING_LINE.exec(line)
      if (match) {
        latest = {
          id: match[1],
          severity: severityOf(match[2]),
          bucket: bucketOf(match[3]),
          round1Miss: match[4].includes('[round-1-miss]'),
          continuation: []
        }
        result.findings.push(latest)
      } else {
        result.errors.push(`${path}: ${findingError(line)}: "${line}"`)
      }
    }
  }
  if (result.verdict === null && !malformedVerdict) {
    result.errors.push(`${path}: missing VERDICT line`)
  }
  return result
}
