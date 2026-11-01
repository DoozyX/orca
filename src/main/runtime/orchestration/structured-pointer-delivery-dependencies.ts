import type { OrchestrationDb } from './db'
import type { OrchestrationCliCommand } from './cli-command'
import type { OrchestrationMessageWaiter } from './mailbox-pointer-eligibility'
import type { SenderNameResolver } from './agent-message-sender'
import type { StructuredPointerRetainReason } from './structured-session-pointer-delivery'
import type { StructuredMailboxPointerHost } from './structured-mailbox-pointer-host-contract'
import type { StructuredSendDelivery } from './structured-pointer-outcome-watch'
import type { StructuredPointerTarget } from './structured-mailbox-pointer-delivery'

/** What the structured mailbox pointer lane needs from the runtime. */
export type StructuredPointerDeliveryDependencies<TWaiter extends OrchestrationMessageWaiter> = {
  getDb: () => OrchestrationDb | null
  getMessageWaiters: (mailboxHandle: string) => ReadonlySet<TWaiter> | undefined
  /** Resolve dispatch or direct-worker mail to its session; null delegates to the PTY lane. */
  resolveStructuredTarget: (mailboxHandle: string) => StructuredPointerTarget | null
  /** The CLI name the PTY lane types for a local agent, so both lanes send the same pointer. */
  getCliCommand: () => OrchestrationCliCommand
  /** What Orca calls a sender now, snapshotted onto the message; null when it has no name. */
  senderName: SenderNameResolver
  host: StructuredMailboxPointerHost
  onRetain?: (input: {
    mailboxHandle: string
    sessionId: string
    reason: StructuredPointerRetainReason
  }) => void
  /** Every attempt's answer for the mail it stood for; null when it put nothing in the chat. */
  onAttemptSettled?: (input: {
    mailboxHandle: string
    messageIds: readonly string[]
    delivery: StructuredSendDelivery | null
  }) => void
}
