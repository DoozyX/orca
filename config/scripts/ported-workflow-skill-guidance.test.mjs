import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')

// The two workflow skills ported from agent-deck: a design gate and the delivery recipe
// that runs on top of the orchestration runtime.
const PORTED_SKILLS = {
  brainstorming: {
    headings: ['## Outcome', '## Classify the role', '## The hard gate', '## Safety floor'],
    references: ['design-file.md', 'exit-to-delivery.md', 'question-rounds.md']
  },
  delivery: {
    headings: [
      '## Outcome',
      '## Classify the role',
      '## Authority and safety floor',
      '## Conditional references'
    ],
    references: ['deployed-verification.md', 'parking-and-reporting.md', 'task-pipeline.md']
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

describe.each(Object.entries(PORTED_SKILLS))('%s skill source', (name, contract) => {
  it('ships a guide, a composed stub, and its conditional references', () => {
    const guide = readGuide(name)

    expect(frontmatter(guide)).toContain(`name: ${name}`)
    for (let index = 1; index < contract.headings.length; index += 1) {
      expect(guide.indexOf(contract.headings[index])).toBeGreaterThan(
        guide.indexOf(contract.headings[index - 1])
      )
    }
    expect(readdirSync(join(projectDir, 'skill-guides', name, 'references')).sort()).toEqual(
      contract.references
    )
    for (const reference of contract.references) {
      expect(guide).toContain(`references/${reference}`)
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

  it('preserves the safety floor the execution host owns', () => {
    const guide = squash(readGuide(name))

    expect(guide).toContain('`live` / `unverifiable` / `exited`')
    expect(guide).toContain('Folder workspaces are valid')
    expect(guide).toContain('execution host owns')
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
})

describe('delivery layers on orchestration rather than reimplementing it', () => {
  it('defers Run, Task, and Dispatch authority to the orchestration skill', () => {
    const guide = squash(readGuide('delivery'))

    expect(guide).toContain('Load the `orchestration` guide first')
    expect(guide).toContain('Delivery is a recipe, not a runtime')
  })

  it('states the durable review-attempt budget as policy', () => {
    const guide = squash(readGuide('delivery'))

    expect(guide).toContain(
      'at most three completed reviews and two completed automatic fixes per task'
    )
    expect(guide).toContain('gate-create')
    expect(guide).toContain('gate-resolve')
  })

  it('keeps the deployed-verification outcomes terminal and exhaustive', () => {
    const reference = readFileSync(
      join(projectDir, 'skill-guides', 'delivery', 'references', 'deployed-verification.md'),
      'utf8'
    )

    for (const outcome of ['`pass`', '`defect`', '`inconclusive`']) {
      expect(reference).toContain(outcome)
    }
    expect(squash(reference)).toContain('never for packaging')
  })
})

describe('brainstorming design files stay out of version control', () => {
  it('writes to an ignored workspace-local directory without requiring Git', () => {
    const reference = squash(
      readFileSync(
        join(projectDir, 'skill-guides', 'brainstorming', 'references', 'design-file.md'),
        'utf8'
      )
    )

    expect(reference).toContain('.orca/design/')
    expect(reference).toContain('info/exclude')
    expect(reference).toContain('Folder workspaces are valid and this step must not require Git')
  })
})
