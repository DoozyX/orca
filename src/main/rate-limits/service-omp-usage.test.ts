import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './service'
import { fetchOmpRateLimits } from './omp-usage-fetcher'
import { fetchClaudeRateLimits } from './claude-fetcher'
import { fetchCodexRateLimits } from './codex-fetcher'
import { okProvider, resetRateLimitProviderMocks } from './rate-limit-service-test-harness'

vi.mock('./claude-fetcher', () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchManagedAccountUsage: vi.fn()
}))
vi.mock('./codex-fetcher', () => ({
  fetchCodexRateLimits: vi.fn(),
  consumeCodexRateLimitResetCredit: vi.fn()
}))
vi.mock('./gemini-usage-fetcher', () => ({ fetchGeminiRateLimits: vi.fn() }))
vi.mock('./kimi-fetcher', () => ({ fetchKimiRateLimits: vi.fn() }))
vi.mock('./opencode-go-usage-source-selection', () => ({ fetchOpenCodeGoUsage: vi.fn() }))
vi.mock('./minimax/minimax-fetcher', () => ({ fetchMiniMaxRateLimits: vi.fn() }))
vi.mock('./grok-fetcher', () => ({ fetchGrokRateLimits: vi.fn() }))
vi.mock('./grok-auth', () => ({ readGrokAuthSession: vi.fn(() => ({ status: 'missing' })) }))
vi.mock('./cursor-fetcher', () => ({ fetchCursorRateLimits: vi.fn() }))
vi.mock('./cursor-auth', () => ({ readCursorAuthSession: vi.fn() }))
vi.mock('./omp-usage-fetcher', () => ({ fetchOmpRateLimits: vi.fn() }))
vi.mock('./zcode-usage-fetcher', () => ({ fetchZcodeRateLimits: vi.fn() }))
vi.mock('./antigravity-usage-fetcher', () => ({ fetchAntigravityRateLimits: vi.fn() }))
vi.mock('../minimax/minimax-cookie-store', () => ({ hasMiniMaxSessionCookie: vi.fn(() => false) }))

const daily = {
  usedPercent: 6,
  windowMinutes: 1440,
  resetsAt: Date.now() + 86_400_000,
  resetDescription: 'tomorrow'
}
const healthy = {
  provider: 'omp' as const,
  session: null,
  daily,
  weekly: null,
  buckets: [{ name: 'Usage (Google)', ...daily }],
  updatedAt: Date.now(),
  error: null,
  status: 'ok' as const,
  usageMetadata: {
    source: 'cli' as const,
    modelIdentity: 'google-antigravity/gemini-3.8-flash:high'
  }
}

beforeEach(() => {
  resetRateLimitProviderMocks()
  vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 0))
  vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 0))
})

describe('RateLimitService omp usage', () => {
  it('publishes omp on a full cycle and keeps a recent reading after a fetch error', async () => {
    vi.mocked(fetchOmpRateLimits).mockResolvedValueOnce(healthy)
    const service = new RateLimitService()
    await service.refresh()
    expect(service.getState().omp?.daily?.usedPercent).toBe(6)

    vi.mocked(fetchOmpRateLimits).mockResolvedValueOnce({
      ...healthy,
      daily: null,
      buckets: [],
      status: 'error',
      error: 'omp usage timed out'
    })
    await service.refresh()
    expect(service.getState().omp).toMatchObject({
      status: 'error',
      error: 'omp usage timed out',
      daily: { usedPercent: 6 }
    })
  })

  it('clears stale quota when the default model changes before a failed refresh', async () => {
    vi.mocked(fetchOmpRateLimits).mockResolvedValueOnce(healthy)
    const service = new RateLimitService()
    await service.refresh()

    vi.mocked(fetchOmpRateLimits).mockResolvedValueOnce({
      ...healthy,
      daily: null,
      buckets: [],
      status: 'error',
      error: 'omp usage timed out',
      usageMetadata: { source: 'cli', modelIdentity: 'google-antigravity/claude-sonnet-4' }
    })
    await service.refresh()
    expect(service.getState().omp).toMatchObject({ status: 'error', daily: null, buckets: [] })
  })

  it('clears stale quota when a failed refresh cannot identify the active model', async () => {
    vi.mocked(fetchOmpRateLimits).mockResolvedValueOnce(healthy)
    const service = new RateLimitService()
    await service.refresh()

    vi.mocked(fetchOmpRateLimits).mockResolvedValueOnce({
      ...healthy,
      daily: null,
      buckets: [],
      status: 'error',
      error: 'omp config.yml could not be read',
      usageMetadata: { source: 'cli' }
    })
    await service.refresh()
    expect(service.getState().omp).toMatchObject({ status: 'error', daily: null, buckets: [] })
  })
})
