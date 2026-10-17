import type { AgentJournalMessageItem } from '../../../shared/agent-session-journal-types'
import type { MessageRow, OrchestrationDb } from './db'
import { formatMessagePointer } from './formatter'
import type { OrchestrationCliCommand } from './cli-command'
import { structuredMailSource } from './structured-mail-source'
import type { SenderNameResolver } from './agent-message-sender'

/** The chat message that points a structured session at its unread mail. */
export function structuredPointerMessage(input: {
  db: OrchestrationDb
  mailboxHandle: string
  dispatchId: string | null
  unread: readonly MessageRow[]
  cliCommand: OrchestrationCliCommand
  senderName: SenderNameResolver
}): AgentJournalMessageItem {
  const { db, mailboxHandle, unread } = input
  return {
    kind: 'message',
    role: 'user',
    blocks: [
      {
        type: 'text',
        text: formatMessagePointer(unread.length, mailboxHandle, input.cliCommand).trim()
      }
    ],
    from: structuredMailSource({
      db,
      mailboxHandle,
      dispatchId: input.dispatchId,
      batch: unread,
      senderName: input.senderName
    })
  }
}
