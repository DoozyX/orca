import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_HANDLERS } from '../orchestration/orchestration-handlers'
import { ReviewLedgerRefusedError } from './review-ledger-errors'

const FIX_NEEDED = [
  '## Merged findings',
  'R1.1. a.ts:3 - major - [patch] - [Edge] - null user reaches the read; return early',
  '   class: missing null guard | sweep: `rg "user\\."` -> 1 sites',
  '   evidence: `user.id` at a.ts:3 with user null',
  'Checked: tests full cmd=pnpm test exit=0 duration=41',
  'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0',
  ''
].join('\n')

const CLEAN = [
  '## Merged findings',
  'Checked: tests full cmd=pnpm test exit=0 duration=41',
  'VERDICT: clean',
  ''
].join('\n')

describe('review ledger commands', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-review-ledger-'))
    mkdirSync(join(root, 'orchestrate'))
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  async function run(command: string, flags: Record<string, string | boolean>): Promise<void> {
    await ORCHESTRATION_HANDLERS[`orchestration ${command}`]({
      flags: new Map<string, string | boolean>([
        ['run', root],
        ['unit', 'u1'],
        ...Object.entries(flags)
      ]),
      get client(): never {
        throw new Error('ledger commands must not touch the runtime client')
      },
      cwd: root,
      json: false
    })
  }

  async function review(kind: string, head: string, text: string): Promise<void> {
    await run('ledger-reserve', { kind, base: 'b0', head })
    writeFileSync(join(root, 'findings.md'), text)
    await run('ledger-settle', { findings: 'findings.md' })
  }

  async function fix(head: string, result: string): Promise<void> {
    await run('ledger-reserve', { kind: 'fix', base: 'b0', head })
    await run('ledger-settle', { outcome: 'done', 'result-sha': result })
  }

  function outcomes(): string[] {
    return readFileSync(join(root, 'orchestrate/budget.md'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('| u1 '))
      .map((line) => {
        const cells = line.split('|').map((cell) => cell.trim())
        return `${cells[2]} ${cells[3]}/${cells[4]} ${cells[9]}`
      })
  }

  it('stops a unit after three reviews and two fixes', async () => {
    await review('review-full', 'h1', FIX_NEEDED)
    await fix('h1', 'h2')
    await review('review-round', 'h2', FIX_NEEDED)
    await fix('h2', 'h3')
    await review('review-round', 'h3', FIX_NEEDED)

    await expect(run('ledger-reserve', { kind: 'fix', base: 'b0', head: 'h3' })).rejects.toThrow(
      ReviewLedgerRefusedError
    )
    await expect(
      run('ledger-reserve', { kind: 'review-round', base: 'b0', head: 'h3' })
    ).rejects.toThrow(ReviewLedgerRefusedError)
    expect(outcomes()).toEqual([
      'review-full 1/- fix-needed',
      'fix -/1 done',
      'review-round 2/- fix-needed',
      'fix -/2 done',
      'review-round 3/- fix-needed'
    ])
  })

  it('lets a recorded decision continue past the budget', async () => {
    await review('review-full', 'h1', FIX_NEEDED)
    await fix('h1', 'h2')
    await review('review-round', 'h2', FIX_NEEDED)
    await fix('h2', 'h3')
    await review('review-round', 'h3', FIX_NEEDED)

    await run('ledger-reserve', {
      kind: 'fix-override',
      base: 'b0',
      head: 'h3',
      reason: 'decision D2: user approved a third fix'
    })
    expect(outcomes().at(-1)).toBe('fix-override -/3 reserved')
  })

  it('refuses a review of a head the last fix did not produce', async () => {
    await review('review-full', 'h1', FIX_NEEDED)
    await fix('h1', 'h2')

    await expect(
      run('ledger-reserve', { kind: 'review-round', base: 'b0', head: 'h9' })
    ).rejects.toThrow('stale HEAD')
  })

  it('refuses a second review once the same base and head are clean', async () => {
    await review('review-full', 'h1', CLEAN)

    await expect(
      run('ledger-reserve', { kind: 'review-round', base: 'b0', head: 'h1' })
    ).rejects.toThrow('already clean')
  })

  it('records a review whose verdict disagrees with its findings as invalid', async () => {
    await review('review-full', 'h1', FIX_NEEDED.replace('patch=1', 'patch=2'))
    expect(outcomes()).toEqual(['review-full 1/- invalid'])

    await review('review-full', 'h1', FIX_NEEDED)
    expect(outcomes()).toEqual(['review-full 1/- invalid', 'review-full 1/- fix-needed'])
  })

  it('accepts a review without a full-suite line only with --no-full-suite', async () => {
    const noSuite = CLEAN.replace('Checked: tests full cmd=pnpm test exit=0 duration=41\n', '')
    await review('review-full', 'h1', noSuite)
    expect(outcomes()).toEqual(['review-full 1/- invalid'])

    await run('ledger-reserve', { kind: 'review-full', base: 'b0', head: 'h1' })
    writeFileSync(join(root, 'findings.md'), noSuite)
    await run('ledger-settle', { findings: 'findings.md', 'no-full-suite': true })
    expect(outcomes().at(-1)).toBe('review-full 1/- clean')
  })
})
