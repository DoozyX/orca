import type {
  FindingBucket,
  ParsedFindingsFile,
  VerdictCounts
} from '../review-metrics/review-findings-parser'

export type ReviewSettlement =
  | { outcome: 'clean' | 'fix-needed'; counts: VerdictCounts }
  | { outcome: 'invalid'; problems: string[] }

const BUCKETS: FindingBucket[] = ['patch', 'decision-needed', 'nit', 'defer']

function countFindings(parsed: ParsedFindingsFile): VerdictCounts {
  const counts: VerdictCounts = { patch: 0, 'decision-needed': 0, nit: 0, defer: 0 }
  for (const finding of parsed.findings) {
    counts[finding.bucket] += 1
  }
  return counts
}

function patchProblems(parsed: ParsedFindingsFile): string[] {
  const problems: string[] = []
  for (const finding of parsed.findings) {
    if (finding.bucket !== 'patch') {
      continue
    }
    if (finding.severity === 'minor') {
      problems.push(`${finding.id}: a patch is critical or major, a minor one is a nit`)
    }
    const hasClass = finding.continuation.some((line) => /^class: .*\| sweep: /.test(line))
    const hasEvidence = finding.continuation.some((line) => line.startsWith('evidence: '))
    if (!hasClass || !hasEvidence) {
      problems.push(`${finding.id}: a patch needs its class/sweep and evidence lines`)
    }
  }
  return problems
}

/** The outcome a review's findings file earns, or why it cannot be counted. */
export function settleReview(
  parsed: ParsedFindingsFile,
  options: { fullSuiteRequired: boolean }
): ReviewSettlement {
  const problems = [...parsed.errors, ...patchProblems(parsed)]
  const counts = countFindings(parsed)
  const blocking = counts.patch + counts['decision-needed']
  if (parsed.verdict?.outcome === 'clean' && blocking > 0) {
    problems.push(`VERDICT: clean lists ${blocking} patch or decision-needed finding(s)`)
  }
  if (parsed.verdict?.outcome === 'fix-needed') {
    if (blocking === 0) {
      problems.push('VERDICT: fix-needed lists no patch or decision-needed finding')
    }
    for (const bucket of BUCKETS) {
      if (parsed.verdict.counts[bucket] !== counts[bucket]) {
        problems.push(
          `VERDICT ${bucket}=${parsed.verdict.counts[bucket]} but the merged list has ${counts[bucket]}`
        )
      }
    }
  }
  const suiteRan = parsed.fullSuiteCheck !== null && /\bexit=\d+/.test(parsed.fullSuiteCheck)
  if (options.fullSuiteRequired && !suiteRan) {
    problems.push('no "Checked: tests full cmd=<cmd> exit=<n> duration=<s>" line')
  }
  if (problems.length > 0 || parsed.verdict === null) {
    return { outcome: 'invalid', problems }
  }
  return { outcome: parsed.verdict.outcome, counts }
}
