import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))
vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { usagePercentageDisplay: 'used' }) => unknown) =>
    selector({ usagePercentageDisplay: 'used' })
}))

const window = {
  usedPercent: 6,
  windowMinutes: 1440,
  resetsAt: 1_790_531_969_000,
  resetDescription: 'tomorrow'
}
const omp: ProviderRateLimits = {
  provider: 'omp',
  session: null,
  daily: window,
  weekly: null,
  buckets: [
    { name: 'Usage (Google)', ...window },
    { name: 'Usage (OpenAI)', ...window, usedPercent: 25 },
    { name: 'Usage (Anthropic)', ...window, usedPercent: 41 }
  ],
  updatedAt: Date.now(),
  error: null,
  status: 'ok'
}

describe('omp status-bar segment', () => {
  it('shows the default-model daily percentage in the segment', async () => {
    const { ProviderSegment } = await import('./StatusBar')
    const markup = renderToStaticMarkup(
      <ProviderSegment p={omp} compact={false} display="used" mode="verbose" />
    )
    expect(markup).toContain('6%')
    expect(markup).not.toContain('25%')
  })

  it('shows all three pools and the daily headline in tooltip sections', async () => {
    const { getWindowSections } = await import('./tooltip')
    const sections = getWindowSections(omp)
    expect(sections.map((section) => section.label)).toEqual([
      'Usage (Google)',
      'Usage (OpenAI)',
      'Usage (Anthropic)',
      'Daily',
      'Weekly'
    ])
    expect(sections.find((section) => section.label === 'Daily')?.window?.usedPercent).toBe(6)
  })
})
