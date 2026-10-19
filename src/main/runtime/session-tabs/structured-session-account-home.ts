import type { StructuredAgentId } from '../../../shared/agent-session-provider-handle'
import { structuredAgentAccountHomeResolver } from '../structured-agent-account-home-resolver'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'
import { OrcaRuntimeWithStructuredSessionCliWriterHost } from './structured-session-cli-writer-host'

export abstract class OrcaRuntimeWithStructuredSessionAccountHome extends OrcaRuntimeWithStructuredSessionCliWriterHost {
  /** Where a launch of `agent` finds its account, resolved on this host by the agent's own
   *  registration; null for an agent this runtime does not register, whose create is refused. */
  protected structuredAgentAccountHomeResolver(
    agent: StructuredAgentId,
    worktree: string,
    purpose: 'launch' | 'read',
    hostLaunchDirectory?: string
  ) {
    return structuredAgentAccountHomeResolver({
      agent,
      purpose,
      services: {
        getClaudeConfigDirectory: (target) => this.accounts.getClaudeConfigDirectory(target),
        claudeHomeBindingStore: this.store ?? null,
        assertClaudeBoundHomeUsable: this.assertClaudeBoundHomeUsableFn,
        prepareCodexLaunchHome: this.prepareCodexStructuredLaunchFn,
        readCodexLaunchHome: this.resolveCodexStructuredLaunchHomeFn,
        workspaceTrustSettings: () => this.requireStore().getSettings(),
        // The chat host's own state root (ensureStructuredAgentSessionHost).
        stateDirectory: getProfileUserDataPath()
      },
      launchDirectory: async () =>
        hostLaunchDirectory ?? (await this.resolveRuntimeFileTarget(worktree)).worktree.path
    })
  }
}
