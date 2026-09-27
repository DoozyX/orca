import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const guide = (name) => readFileSync(join(root, 'skill-guides', name), 'utf8')

describe('engine roles guidance', () => {
  it('validates and merges global and repository role files before dispatch', () => {
    const text = guide('orchestration/references/coordinator-loop.md')
    expect(text).toContain('## Engine roles')
    expect(text).toContain('~/.orca/agent-roles.json')
    expect(text).toContain('.orca/agent-roles.json')
    expect(text).toContain('crossEngineReview')
    expect(text).toContain('skipAbovePercent')
    expect(text).toContain('planner')
    expect(text).toContain('implementer')
    expect(text).toContain('ui')
    expect(text).toContain('reviewer')
    expect(text).toContain('inspector')
    expect(text).toContain('strong')
    expect(text).toContain('per role')
    expect(text).toContain('engine-roles invalid:')
    expect(text.toLowerCase()).toContain('before the first dispatch')
  })

  it('excludes unavailable quota and retries a failed startup on another engine', () => {
    const text = guide('orchestration/references/coordinator-loop.md')
    expect(text).toContain('orca account list --refresh-usage --json')
    expect(text).toContain('>= skipAbovePercent')
    expect(text).toContain('no-quota-data')
    expect(text).toContain('never eligible')
    expect(text).toContain('startup-failed')
    expect(text).toContain('unavailable')
    expect(text).toContain('re-run selection')
    expect(text).toContain('launch.effective')
  })

  it('maps dispatches to roles and records cross-engine review and parking', () => {
    const pipeline = guide('delivery/references/task-pipeline.md')
    const delivery = guide('delivery.md')
    expect(pipeline).toContain('Dispatch → role')
    expect(pipeline).toContain('different engine')
    expect(pipeline).toContain('same-engine-review')
    expect(pipeline).toContain('--agent <selected>')
    expect(delivery).toContain('## Engine roles')
    expect(delivery).toContain('role=<r> agent=<a> model=<m|default> quota=<max used %>')
    expect(delivery).toContain('quota@<earliest')
    expect(delivery).toContain('needs-attention')
    expect(delivery).toContain('role=<r> source=default')
  })
})
