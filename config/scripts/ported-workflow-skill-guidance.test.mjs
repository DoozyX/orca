import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')

// The six workflow skills: a design gate, the delivery recipe that
// runs on the orchestration runtime, and the four quality layers delivery hands work to.
const PORTED_SKILLS = {
  brainstorming: {
    headings: ['## Outcome', '## Classify the role', '## The hard gate', '## Safety floor'],
    references: ['design-file.md', 'exit-to-delivery.md', 'question-rounds.md'],
    safetyFloor: ['`live` / `unverifiable` / `exited`', 'Folder workspaces are valid'],
    notThis: ['delivery', 'orchestration']
  },
  debug: {
    headings: ['## Outcome', '## Iron law', '## Three-failed-fixes circuit breaker'],
    references: [],
    safetyFloor: ['`unverifiable`', 'contact loss is not process death'],
    notThis: ['review', 'tdd', 'verify']
  },
  delivery: {
    headings: [
      '## Outcome',
      '## Classify the role',
      '## Authority and safety floor',
      '## Conditional references'
    ],
    references: [
      'deployed-verification.md',
      'parking-and-reporting.md',
      'planning-and-splitting.md',
      'stage-prompts.md',
      'task-pipeline.md'
    ],
    safetyFloor: ['`live` / `unverifiable` / `exited`', 'Folder workspaces are valid'],
    notThis: ['orchestration', 'brainstorming']
  },
  review: {
    headings: [
      '## Outcome',
      '## Classify the role',
      '## Safety floor',
      '## Conditional references'
    ],
    references: [
      'adversarial.md',
      'deletion-check.md',
      'edge-cases.md',
      'principles.md',
      'verification-gap.md'
    ],
    safetyFloor: ['`unverifiable`', 'Folder workspaces are valid'],
    notThis: ['debug', 'tdd', 'verify']
  },
  tdd: {
    headings: ['## Outcome', '## Iron law', '## The cycle', '## Mutation check'],
    references: [],
    safetyFloor: ['folder workspace'],
    notThis: ['debug', 'verify']
  },
  verify: {
    headings: ['## Outcome', '## Iron law', '## Claim to evidence', '## Baselines'],
    references: [],
    safetyFloor: ['`live` / `unverifiable` / `exited`', 'Folder workspaces are valid'],
    notThis: ['tdd', 'review', 'debug']
  }
}

function readGuide(name) {
  return readFileSync(join(projectDir, 'skill-guides', `${name}.md`), 'utf8')
}

function frontmatter(text) {
  return /^---\n[\s\S]*?\n---\n/u.exec(text)?.[0]
}

function squash(text) {
  return text.replace(/\s+/gu, ' ').trim()
}

function readStub(name) {
  return readFileSync(join(projectDir, 'skills', name, 'SKILL.md'), 'utf8')
}

function readReference(guide, reference) {
  return readFileSync(join(projectDir, 'skill-guides', guide, 'references', reference), 'utf8')
}

describe.each(Object.entries(PORTED_SKILLS))('%s skill source', (name, contract) => {
  it('ships a guide whose sections stay in the documented order', () => {
    const guide = readGuide(name)

    expect(frontmatter(guide)).toContain(`name: ${name}`)
    for (let index = 1; index < contract.headings.length; index += 1) {
      expect(guide.indexOf(contract.headings[index])).toBeGreaterThan(
        guide.indexOf(contract.headings[index - 1])
      )
    }
  })

  it('declares exactly the conditional references its action gates name', () => {
    const referenceRoot = join(projectDir, 'skill-guides', name, 'references')
    const found = existsSync(referenceRoot) ? readdirSync(referenceRoot).sort() : []

    expect(found).toEqual(contract.references)
    for (const reference of contract.references) {
      expect(readGuide(name)).toContain(`references/${reference}`)
    }
  })

  it('projects a discovery stub that resolves the executable before any command', () => {
    const stub = readStub(name)

    expect(frontmatter(stub)).toBe(frontmatter(readGuide(name)))
    expect(stub).toContain('discovery stub')
    expect(stub).toContain(`ORCA skills get ${name}`)
    expect(stub).toContain('ORCA_CLI_COMMAND')
    expect(stub).toContain('GNOME Orca screen reader')
    expect(stub).not.toMatch(/^orca /mu)
    expect(stub.length).toBeLessThan(readGuide(name).length)
  })

  it('preserves the safety floor the guide is responsible for', () => {
    const guide = squash(readGuide(name))

    for (const clause of contract.safetyFloor) {
      expect(guide).toContain(clause)
    }
  })

  it('says in its description which sibling skill owns the neighbouring job', () => {
    const description = squash(frontmatter(readGuide(name)))

    expect(description).toContain('This is not')
    for (const sibling of contract.notThis) {
      expect(description).toContain(`\`${sibling}\``)
    }
  })
})

describe('workflow skill routing', () => {
  it('separates the coordination runtime from the delivery recipe', () => {
    const delivery = squash(frontmatter(readGuide('delivery')))
    const orchestration = squash(frontmatter(readGuide('orchestration')))

    expect(delivery).toContain('`delivery` is the recipe, `orchestration` is the runtime')
    expect(delivery).not.toMatch(/orchestrate\b/u)
    expect(orchestration).toContain('the coordination runtime')
    expect(orchestration).toContain('use the `delivery` skill')
  })

  it('keeps the brainstorming approval gate in the routing description', () => {
    const description = squash(frontmatter(readGuide('brainstorming')))

    expect(description).toContain('Hard-gates implementation')
    expect(description).toContain('approved')
  })

  it('chains brainstorming to delivery and both to the quality layers', () => {
    expect(squash(readGuide('brainstorming'))).toContain('`tdd`')
    expect(squash(readGuide('brainstorming'))).toContain('`delivery`')
    expect(squash(readGuide('delivery'))).toContain(
      'the `tdd`, `review`, `debug`, and `verify` skills'
    )
    for (const name of ['debug', 'tdd', 'verify', 'review']) {
      expect(readGuide(name)).toContain('## Hands off to')
    }
  })
})

describe('delivery layers on orchestration rather than reimplementing it', () => {
  it('defers Run, Task, and Dispatch authority to the orchestration skill', () => {
    const guide = squash(readGuide('delivery'))

    expect(guide).toContain('Load the `orchestration` guide first')
    expect(guide).toContain('Delivery is a recipe, not a runtime')
  })

  it('states the durable review-attempt budget as policy', () => {
    const guide = squash(readGuide('delivery'))

    expect(guide).toContain('at most three counted reviews and two counted fixes')
    expect(guide).toContain('gate-create')
    expect(guide).toContain('gate-resolve')
  })

  it('accounts for pre-review rework without resetting budgets or stopping live workers', () => {
    const guide = squash(readGuide('delivery'))

    expect(guide).toContain('two amendments and two recovery attempts per unit')
    expect(guide).toContain('normal test-first iterations are not amendments')
    expect(guide).toContain('routine status inspection is not recovery')
    expect(guide).toContain('Reserve each attempt before work')
    expect(guide).toContain('revision-or-source-evidence')
    expect(guide).toContain(
      'Existing user-authorized extensions are recorded and honored without asking again'
    )
    expect(guide).toContain('Never stop a live worker solely because a counter is reached')
    expect(guide).toContain(
      'These counts never reset review/fix budgets, worker identities, or command deadlines'
    )
  })

  it('keeps task briefs concise without omitting binding rules or mandated evidence', () => {
    const reference = squash(readReference('delivery', 'stage-prompts.md'))

    expect(reference).toContain('6,000 Unicode characters')
    expect(reference).toContain('excluding Orca’s injected preamble')
    expect(reference).toContain('soft authoring target, not a token limit')
    expect(reference).toContain('Mandatory identity, authority, and evidence requirements win')
    expect(reference).toContain('state why the target is exceeded')
  })

  it('plans expensive validation capacity on the execution host without inventing resource policy', () => {
    const reference = squash(readReference('delivery', 'task-pipeline.md'))

    expect(reference).toContain(
      'execution host, required services and resources, scratch path, and result location'
    )
    expect(reference).toContain(
      'Unavailable capacity blocks that validation; independent work may continue'
    )
    expect(reference).toContain(
      'No generic disk threshold, invented lease protocol, or automatic cleanup'
    )
    expect(squash(readReference('delivery', 'parking-and-reporting.md'))).toContain(
      'amendment and recovery attempts, continuation decisions, and capacity blockers'
    )
  })

  it('keeps the deployed-verification outcomes terminal and exhaustive', () => {
    const reference = readReference('delivery', 'deployed-verification.md')

    for (const outcome of ['`pass`', '`defect`', '`inconclusive`']) {
      expect(reference).toContain(outcome)
    }
    expect(squash(reference)).toContain('never for packaging')
  })
})

describe('brainstorming design file guidance', () => {
  it('covers ignored storage and proportionate data-model presentation', () => {
    const reference = squash(readReference('brainstorming', 'design-file.md'))

    expect(reference).toContain('.orca/<date>-<slug>/design/design.md')
    expect(reference).toContain('info/exclude')
    expect(reference).toContain('Folder workspaces are valid and this step must not require Git')
    expect(reference).toContain('Field | Type | Nullable | Keys | Constraints')
    expect(reference).toContain('Mermaid `erDiagram`')
    expect(reference).toContain('cardinality and optionality')
    expect(reference).toContain('including composite membership')
    expect(reference).toContain(
      'Tables and graphs complement rather than replace concrete contracts'
    )
    expect(reference).toContain('Keep simple designs simple')
  })
})

describe('quality-layer invariants', () => {
  it('keeps the debug circuit breaker at three attempts and escalating', () => {
    const guide = squash(readGuide('debug'))

    expect(guide).toContain('After the third failed fix attempt, stop. Do not attempt a fourth.')
    expect(guide).toContain('No fix without a root cause you can state first.')
  })

  it('keeps the tdd cycle red before green and the mock gate in place', () => {
    const guide = squash(readGuide('tdd'))

    expect(guide).toContain('No production code without a failing test first.')
    expect(guide).toContain('it fails, and it fails **for the right reason**')
    expect(guide).toContain('Never assert on the mock itself.')
  })

  it('keeps the verify evidence gate scoped to this message', () => {
    const guide = squash(readGuide('verify'))

    expect(guide).toContain('No completion claim without fresh evidence in this message.')
    expect(guide).toContain('never the worker')
  })

  it('keeps the review layer asymmetry, severity ban, and literal verdict lines', () => {
    const guide = readGuide('review')

    expect(squash(guide)).toContain('The asymmetry is a rule, not a preference.')
    expect(guide).toContain('VERDICT: clean')
    expect(guide).toContain('VERDICT: fix-needed patch=<n> decision-needed=<n> defer=<n>')
    for (const layer of [
      'adversarial.md',
      'edge-cases.md',
      'verification-gap.md',
      'deletion-check.md'
    ]) {
      expect(squash(readReference('review', layer))).toMatch(
        /[Ss]everity ban|Severity is decided at merge/u
      )
    }
  })
})

describe('folded trigger vocabulary from the skills that were not ported', () => {
  it('routes single-session terminal work through orca-cli', () => {
    const description = squash(frontmatter(readGuide('orca-cli')))
    const guide = readGuide('orca-cli')

    for (const trigger of [
      '"session"',
      '"sub-agent"',
      '"create a session"',
      '"stop a session"',
      '"fork a session"',
      '"attach to a session"',
      '"worktree session"'
    ]) {
      expect(description).toContain(trigger)
    }
    expect(guide).toContain('## Sessions and Terminals')
    expect(squash(guide)).toContain('An Orca terminal is what other tools call a session.')
  })

  it('routes fan-out work through orchestration worker-start, worker-list, and check --wait', () => {
    const description = squash(frontmatter(readGuide('orchestration')))
    const guide = squash(readGuide('orchestration'))

    for (const trigger of [
      '"launch several sessions"',
      '"launch N sessions"',
      '"fan out"',
      '"run agents in parallel"',
      '"spin up a fleet"',
      '"kick off background agents"',
      '"check progress without blocking"'
    ]) {
      expect(description).toContain(trigger)
    }
    expect(guide).toContain(
      '`worker-start` per agent, then `worker-list` to poll and the waiting `check` below to settle'
    )
  })

  it('does not port or reference session sharing', () => {
    for (const name of Object.keys(PORTED_SKILLS)) {
      expect(readGuide(name)).not.toMatch(/session-share/u)
    }
    expect(readdirSync(join(projectDir, 'skills'))).not.toContain('session-share')
  })
})
