import type { AgentJournalMessageItem } from '../../../shared/agent-session-journal-types'
import type { StructuredDispatchState } from './structured-session-pointer-delivery'
import type { StructuredPointerSubmission } from './structured-pointer-operation-id'

export type StructuredPointerSendOutcome =
  | { kind: 'sent'; state: StructuredDispatchState }
  | { kind: 'held' }
  /** The chat's queue took it, as it takes a person's message. */
  | { kind: 'queued' }
  | { kind: 'unattached' }

export type StructuredPointerSessionFacts = {
  /** Current-context sends, oldest first: what the lane's own sends settled as. */
  submissions: readonly StructuredPointerSubmission[]
}

export type StructuredMailboxPointerHost = {
  /** `null` when the session cannot be read. */
  readSessionFacts: (sessionId: string) => Promise<StructuredPointerSessionFacts | null>
  hasActionablePromptNow: (sessionId: string) => boolean | null
  send: (input: {
    sessionId: string
    dispatchId: string | null
    operationId: string
    expectedRuntimeFence: number
    /** Names its senders as `from`. */
    body: AgentJournalMessageItem
  }) => Promise<StructuredPointerSendOutcome>
  /** Current lease fence; `null` when no record backs the session any more. */
  currentFence: (sessionId: string) => number | null
  currentContextClearOperationId: (sessionId: string) => string | undefined
}
