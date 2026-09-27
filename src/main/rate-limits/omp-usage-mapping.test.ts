import { describe, expect, it } from 'vitest'
import { mapOmpUsage } from './omp-usage-mapping'

const reset = 1_790_531_969_000
const report = {
  generatedAt: '2026-09-27T12:00:00.000Z',
  reports: [
    {
      provider: 'google-antigravity',
      fetchedAt: '2026-09-27T12:00:00.000Z',
      limits: [
        {
          id: 'google-antigravity:google:default:daily',
          label: 'Usage (Google)',
          scope: 'account',
          window: { id: 'daily', label: 'Daily', durationMs: 86_400_000, resetsAt: reset },
          amount: { unit: 'percent', usedFraction: 0.06 },
          status: 'ok'
        },
        {
          id: 'google-antigravity:openai:default:daily',
          label: 'Usage (OpenAI)',
          scope: 'account',
          window: { id: 'daily', label: 'Daily', durationMs: 86_400_000, resetsAt: reset },
          amount: { unit: 'percent', usedFraction: 0.25 },
          status: 'ok'
        },
        {
          id: 'google-antigravity:anthropic:default:daily',
          label: 'Usage (Anthropic)',
          scope: 'account',
          window: { id: 'daily', label: 'Daily', durationMs: 86_400_000, resetsAt: reset },
          amount: { unit: 'percent', usedFraction: 0.41 },
          status: 'ok'
        }
      ],
      metadata: {}
    }
  ],
  accountsWithoutUsage: [],
  disabledCredentials: [],
  capacity: null
}

describe('mapOmpUsage', () => {
  it.each([
    ['gemini-3.8-flash:high', 6],
    ['claude-opus-4', 41],
    ['gpt-5', 25],
    ['o3', 25]
  ])('selects the default model pool for %s', (model, percent) => {
    const result = mapOmpUsage(JSON.stringify(report), `google-antigravity/${model}`)
    expect(result.status).toBe('ok')
    expect(result.daily).toMatchObject({
      usedPercent: percent,
      windowMinutes: 1440,
      resetsAt: reset
    })
    expect(result.buckets).toHaveLength(3)
  })

  it('uses the sole reported pool for a model without a known family', () => {
    const single = structuredClone(report)
    single.reports[0].limits = [single.reports[0].limits[0]]
    expect(
      mapOmpUsage(JSON.stringify(single), 'google-antigravity/new-model').daily?.usedPercent
    ).toBe(6)
  })

  it('names a default model whose pool cannot be identified', () => {
    const result = mapOmpUsage(JSON.stringify(report), 'google-antigravity/new-model')
    expect(result.status).toBe('unavailable')
    expect(result.error).toContain(
      'omp default model google-antigravity/new-model has no matching usage pool'
    )
  })

  it('reports malformed JSON as an error', () => {
    const result = mapOmpUsage('{broken', 'google-antigravity/gemini-3.8-flash')
    expect(result.status).toBe('error')
    expect(result.daily).toBeNull()
  })
})
