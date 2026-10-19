import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { isStructuredWorkerHandle } from '../../../../../../shared/structured-worker-handle'
import { AGENT_SESSION_HAS_NO_TERMINAL } from '../../../../structured-worker-terminal-refusal'
import type { OrchestrationCallerIdentity } from '../../../../orchestration/orchestration-caller-identity'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrcaSessionId } from '../../../../../../shared/orca-session-address'
import { formatOrcaSessionAddress } from '../../../../../../shared/orca-session-address'
import {
  admitChatAssignee,
  chatAssigneeOf,
  refuseChatSelfAssignment
} from '../chat-assignee-admission'
import type { OrchestrationParty } from '../../../../orchestration/orchestration-party'

/**
 * Admits a caller-supplied `--terminal` as this dispatch's worker pane.
 *
 * Three refusals, all of which must happen before anything is created: a coordinator adopted as its
 * own worker answers its own dispatch preamble forever, a pane in another worktree is not this
 * dispatch's to take, and a pane with no agent cannot read a preamble at all.
 */
export async function assertExplicitWorkerTerminalUsable(args: {
  runtime: OrcaRuntimeService
  terminal: string
  from: string
  coordinator: OrchestrationCallerIdentity | null
  resolvedWorktreeId: string | undefined
}): Promise<void> {
  const { runtime, terminal, from, coordinator, resolvedWorktreeId } = args
  const explicitTerminal = await runtime.showTerminal(terminal).catch((error: unknown) => {
    throw isAgentSessionRefusal(error) ? structuredWorkerReuseRefusal(terminal, from) : error
  })
  const targetPane = runtime.getTerminalPaneKey(terminal)
  const callerPane = coordinator?.paneKey ?? runtime.getTerminalPaneKey(from)
  // A structured coordinator has no terminal to show, so its own identity is the raw handle plus
  // the pane key; showing `from` unconditionally would throw for exactly those callers. A
  // handle-less session has no terminal at all, so its address is its identity.
  const coordinatorHandle =
    coordinator?.terminalHandle === null
      ? coordinator.address
      : isStructuredWorkerHandle(from)
        ? from
        : (await runtime.showTerminal(from)).handle
  if (
    explicitTerminal.handle === coordinatorHandle ||
    (targetPane !== null && targetPane === callerPane)
  ) {
    throw new OrchestrationError(
      'terminal_is_coordinator',
      `Terminal ${terminal} is this coordinator's own terminal. Pass --terminal for a different agent pane, or omit it so worker-start creates one.`
    )
  }
  if (explicitTerminal.worktreeId !== resolvedWorktreeId) {
    throw new OrchestrationError(
      'terminal_worktree_mismatch',
      `Terminal ${terminal} does not belong to worktree ${resolvedWorktreeId}.`
    )
  }
  if (!(await runtime.isTerminalRunningAgent(terminal))) {
    throw new OrchestrationError(
      'agent_unconfigured',
      `Terminal ${terminal} is not running a recognized agent.`
    )
  }
}

function isAgentSessionRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === AGENT_SESSION_HAS_NO_TERMINAL
  )
}

/** worker-start's refusal for a live structured worker: the reuse route that exists, and its limit (#20). */
function structuredWorkerReuseRefusal(terminal: string, from: string): OrchestrationError {
  return new OrchestrationError(
    AGENT_SESSION_HAS_NO_TERMINAL,
    `${terminal} is a structured agent session, so worker-start --terminal cannot reuse it. ` +
      `To give it another Task, run \`orca orchestration dispatch --task <task_id> --to ${terminal} --from ${from} --return-preamble --json\` ` +
      `and send it the returned preamble with \`orca orchestration send --to ${terminal} --from ${from} --subject <subject> --body <preamble>\`. ` +
      'That reuse is unsupervised: no readiness wait, input receipt or turn observation backs it. ' +
      '`orca orchestration worker-stop --dispatch <dispatch_id>` fences that Dispatch and interrupts ' +
      "the session's running turn; its `interrupt` field says whether it did. For a supervised " +
      'start, omit --terminal so worker-start creates a fresh worker.'
  )
}

/** A `--terminal` party: a terminal pane, or a chat named by its Orca session ID. */
export async function assertExplicitWorkerUsable(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  terminal: OrchestrationParty
  from: string
  coordinator: OrchestrationCallerIdentity | null
  resolvedWorktreeId: string | undefined
}): Promise<void> {
  const chat = chatAssigneeOf(args.terminal)
  await (chat
    ? assertExplicitWorkerChatUsable({ ...args, chat })
    : assertExplicitWorkerTerminalUsable({ ...args, terminal: args.terminal.address }))
}

/** The same refusals for a chat named by its Orca session ID: itself, unreachable, another worktree. */
async function assertExplicitWorkerChatUsable(args: {
  runtime: Pick<OrcaRuntimeService, 'ensureStructuredAgentSessionHost'>
  db: OrchestrationDb
  chat: OrcaSessionId
  coordinator: OrchestrationCallerIdentity | null
  resolvedWorktreeId: string | undefined
}): Promise<void> {
  refuseChatSelfAssignment({
    sessionId: args.chat,
    coordinatorSessionId: args.coordinator?.orcaSessionId,
    remedy: 'Pass --terminal for a different agent, or omit it so worker-start creates one.'
  })
  const session = await admitChatAssignee(args.runtime, args.chat, args.db)
  if (session.location.workspaceId !== args.resolvedWorktreeId) {
    throw new OrchestrationError(
      'terminal_worktree_mismatch',
      `${formatOrcaSessionAddress(args.chat)} does not belong to worktree ${args.resolvedWorktreeId}.`
    )
  }
}
