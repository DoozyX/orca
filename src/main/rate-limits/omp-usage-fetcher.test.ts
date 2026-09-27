import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import { fetchOmpRateLimits } from './omp-usage-fetcher'

vi.mock('../../shared/child-process/run-process', () => ({ runProcess: vi.fn() }))

const dirs: string[] = []
const usage = JSON.stringify({
  reports: [
    {
      provider: 'google-antigravity',
      limits: [
        {
          id: 'google-antigravity:google:default:daily',
          label: 'Usage (Google)',
          status: 'ok',
          window: { durationMs: 86_400_000, resetsAt: 1_790_531_969_000 },
          amount: { usedFraction: 0.06 }
        }
      ]
    }
  ]
})

function configDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'omp-quota-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'config.yml'),
    'modelRoles:\n  default: google-antigravity/gemini-3.8-flash:high\n'
  )
  return dir
}

beforeEach(() => vi.mocked(runProcess).mockReset())
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('fetchOmpRateLimits', () => {
  it('reads the configured omp directory and maps the selected pool', async () => {
    const dir = configDir()
    vi.mocked(runProcess).mockResolvedValue({
      code: 0,
      signal: null,
      timedOut: false,
      stdout: usage,
      stderr: ''
    })
    const result = await fetchOmpRateLimits({ env: { OMP_CODING_AGENT_DIR: dir } })
    expect(result.daily?.usedPercent).toBe(6)
    expect(result.status).toBe('ok')
  })

  it('reports an absent omp executable as unavailable', async () => {
    const dir = configDir()
    const actual = await vi.importActual<{ runProcess: typeof runProcess }>(
      '../../shared/child-process/run-process'
    )
    vi.mocked(runProcess).mockImplementationOnce(actual.runProcess)
    const result = await fetchOmpRateLimits({
      env: { OMP_CODING_AGENT_DIR: dir },
      command: join(dir, 'missing-omp')
    })
    expect(result.status).toBe('unavailable')
    expect(result.error).toContain('omp is not installed')
  })

  it('reports a nonzero exit and a timeout as errors', async () => {
    const dir = configDir()
    vi.mocked(runProcess).mockResolvedValueOnce({
      code: 1,
      signal: null,
      timedOut: false,
      stdout: '',
      stderr: 'failure'
    })
    const exit = await fetchOmpRateLimits({ env: { OMP_CODING_AGENT_DIR: dir } })
    expect(exit.status).toBe('error')
    expect(exit.error).toContain('exit 1')

    vi.mocked(runProcess).mockResolvedValueOnce({
      code: null,
      signal: 'SIGTERM',
      timedOut: true,
      stdout: '',
      stderr: ''
    })
    const timeout = await fetchOmpRateLimits({ env: { OMP_CODING_AGENT_DIR: dir } })
    expect(timeout.status).toBe('error')
    expect(timeout.error).toContain('timed out')
  })
})
