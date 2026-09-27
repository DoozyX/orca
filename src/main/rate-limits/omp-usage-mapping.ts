import { z } from 'zod'
import type { ProviderRateLimits, RateLimitWindow } from '../../shared/rate-limit-types'

const limitSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.string(),
  window: z.object({ durationMs: z.number().positive(), resetsAt: z.number().nullable() }),
  amount: z.object({ usedFraction: z.number().finite().min(0).max(1) })
})
const usageSchema = z.object({
  reports: z.array(z.object({ provider: z.string(), limits: z.array(limitSchema) }))
})

export type OmpRateLimits = ProviderRateLimits & { daily: RateLimitWindow | null }

function result(
  status: OmpRateLimits['status'],
  error: string | null,
  modelIdentity: string,
  daily: RateLimitWindow | null = null,
  buckets: OmpRateLimits['buckets'] = []
): OmpRateLimits {
  return {
    provider: 'omp',
    session: null,
    daily,
    weekly: null,
    buckets,
    updatedAt: Date.now(),
    error,
    status,
    usageMetadata: {
      source: 'cli',
      modelIdentity,
      ...(status === 'error' ? { failureKind: 'parse' as const } : {}),
      ...(status === 'unavailable' ? { failureKind: 'usage-unavailable' as const } : {})
    }
  }
}

function modelFamily(model: string): string | null {
  if (model.startsWith('gemini')) {
    return 'google'
  }
  if (model.startsWith('claude')) {
    return 'anthropic'
  }
  if (model.startsWith('gpt') || /^o\d/.test(model)) {
    return 'openai'
  }
  return null
}

function toWindow(limit: z.infer<typeof limitSchema>): RateLimitWindow {
  const resetsAt = limit.window.resetsAt
  return {
    usedPercent: Math.round(limit.amount.usedFraction * 100),
    windowMinutes: limit.window.durationMs / 60_000,
    resetsAt,
    resetDescription: resetsAt === null ? null : new Date(resetsAt).toLocaleString()
  }
}

/** Map omp's public usage output without publishing account identifiers. */
export function mapOmpUsage(json: string, defaultModel: string): OmpRateLimits {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return result('error', 'omp usage response could not be parsed', defaultModel)
  }
  const parsed = usageSchema.safeParse(raw)
  if (!parsed.success) {
    return result('error', 'omp usage response has an unrecognized shape', defaultModel)
  }
  const slash = defaultModel.indexOf('/')
  const provider = slash === -1 ? '' : defaultModel.slice(0, slash)
  const model = slash === -1 ? defaultModel : defaultModel.slice(slash + 1).split(':')[0]
  const report = parsed.data.reports.find((entry) => entry.provider === provider)
  if (!report) {
    return result(
      'unavailable',
      `omp has no authenticated usage report for ${provider}`,
      defaultModel
    )
  }
  const limits = report.limits.filter((limit) => limit.status === 'ok')
  const buckets = limits.map((limit) => ({ name: limit.label, ...toWindow(limit) }))
  const family = modelFamily(model)
  const headline =
    limits.length === 1
      ? limits[0]
      : family
        ? limits.find((limit) => limit.id.startsWith(`${provider}:${family}:`))
        : undefined
  if (!headline) {
    return result(
      'unavailable',
      `omp default model ${defaultModel} has no matching usage pool`,
      defaultModel
    )
  }
  return result('ok', null, defaultModel, toWindow(headline), buckets)
}
