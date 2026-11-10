import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './rate-limit-service'
import { fetchOmpRateLimits } from '../providers/omp/omp-usage-fetcher'
import { fetchActiveClaudeRateLimits } from '../providers/claude/claude-active-usage-fetch'
import { fetchCodexRateLimits } from '../providers/codex/codex-fetcher'
import { okProvider, resetRateLimitProviderMocks } from './rate-limit-service-test-harness'

vi.mock('../providers/claude/claude-active-usage-fetch', () => ({
  fetchActiveClaudeRateLimits: vi.fn()
}))
vi.mock('../providers/claude/claude-managed-account-usage', () => ({
  fetchInactiveClaudeAccountUsage: vi.fn()
}))
vi.mock('../providers/codex/codex-fetcher', () => ({
  fetchCodexRateLimits: vi.fn(),
  consumeCodexRateLimitResetCredit: vi.fn()
}))
vi.mock('../providers/gemini/gemini-usage-fetcher', () => ({ fetchGeminiRateLimits: vi.fn() }))
vi.mock('../providers/kimi/kimi-fetcher', () => ({ fetchKimiRateLimits: vi.fn() }))
vi.mock('../providers/opencode-go/opencode-go-usage-source-selection', () => ({
  fetchOpenCodeGoUsage: vi.fn()
}))
vi.mock('../providers/minimax/minimax-fetcher', () => ({ fetchMiniMaxRateLimits: vi.fn() }))
vi.mock('../providers/grok/grok-fetcher', () => ({ fetchGrokRateLimits: vi.fn() }))
vi.mock('../providers/grok/grok-auth', () => ({
  readGrokAuthSession: vi.fn(() => ({ status: 'missing' }))
}))
vi.mock('../providers/cursor/cursor-fetcher', () => ({ fetchCursorRateLimits: vi.fn() }))
vi.mock('../providers/cursor/cursor-auth', () => ({ readCursorAuthSession: vi.fn() }))
vi.mock('../providers/omp/omp-usage-fetcher', () => ({ fetchOmpRateLimits: vi.fn() }))
vi.mock('../providers/zcode/zcode-usage-fetcher', () => ({ fetchZcodeRateLimits: vi.fn() }))
vi.mock('../providers/antigravity/antigravity-usage-fetcher', () => ({
  fetchAntigravityRateLimits: vi.fn()
}))
vi.mock('../providers/muse/muse-usage-fetcher', () => ({ fetchMuseRateLimits: vi.fn() }))
vi.mock('../../minimax/minimax-cookie-store', () => ({
  hasMiniMaxSessionCookie: vi.fn(() => false)
}))

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
  vi.mocked(fetchActiveClaudeRateLimits).mockResolvedValue(okProvider('claude', 0))
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
