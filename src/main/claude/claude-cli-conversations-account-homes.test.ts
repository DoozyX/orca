import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLAUDE_CLI_CONVERSATIONS } from './claude-cli-conversations'

const SHARED_CLAUDE_HOME = join(homedir(), '.claude')
const { transcriptImport } = CLAUDE_CLI_CONVERSATIONS
if (!transcriptImport) {
  throw new Error('Claude registers a transcript importer')
}
const { accountHomeCandidates } = transcriptImport

describe('Claude transcript import account-home candidates', () => {
  it('offers the shared Claude home after an unbound selection', () => {
    expect(
      accountHomeCandidates({
        settings: {},
        selectedAccountHome: { variable: 'CLAUDE_CONFIG_DIR', path: '/accounts/selected' }
      })
    ).toEqual([
      { variable: 'CLAUDE_CONFIG_DIR', path: '/accounts/selected' },
      { variable: 'CLAUDE_CONFIG_DIR', path: SHARED_CLAUDE_HOME }
    ])
  })

  // The shared home is another organisation's account; a bound group must refuse, not adopt there.
  it('offers the bound home alone when a project-group binding chose it', () => {
    expect(
      accountHomeCandidates({
        settings: {},
        selectedAccountHome: {
          variable: 'CLAUDE_CONFIG_DIR',
          path: '/bound/claude-home',
          binding: { kind: 'project-group', groupId: 'group-1' }
        }
      })
    ).toEqual([{ variable: 'CLAUDE_CONFIG_DIR', path: '/bound/claude-home' }])
  })
})
