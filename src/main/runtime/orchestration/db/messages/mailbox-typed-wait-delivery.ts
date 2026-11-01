import type { DeliveryRow, MessageType } from '../../types'
import type { OrchestrationDb } from '../orchestration-db'

export function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',')
}

// A typed wait replays only a batch holding an unread row of its types; an untyped check, any batch.
export function selectReplayableDelivery(
  db: OrchestrationDb,
  mailboxHandle: string,
  wakeTypes: MessageType[] | undefined
): DeliveryRow | undefined {
  if (!wakeTypes) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: outstanding_deliveries is SELECT * over deliveries, so its rows are DeliveryRow; the adapter exposes unknown.
    return db.db
      .prepare(
        `SELECT * FROM outstanding_deliveries WHERE mailbox_handle = ?
         ORDER BY created_at, id LIMIT 1`
      )
      .get(mailboxHandle) as DeliveryRow | undefined
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: outstanding_deliveries is SELECT * over deliveries, so its rows are DeliveryRow; the adapter exposes unknown.
  return db.db
    .prepare(
      `SELECT * FROM outstanding_deliveries AS delivery
       WHERE delivery.mailbox_handle = ? AND EXISTS (
         SELECT 1 FROM json_each(delivery.message_ids) AS member
         JOIN messages ON messages.id = member.value
         WHERE messages.read = 0 AND messages.type IN (${sqlPlaceholders(wakeTypes.length)})
       )
       ORDER BY delivery.created_at, delivery.id LIMIT 1`
    )
    .get(mailboxHandle, ...wakeTypes) as DeliveryRow | undefined
}

// Sorted and de-duplicated, because the stored form is the one-outstanding trigger's key.
export function typedWaitKey(wakeTypes: MessageType[] | undefined): MessageType[] | undefined {
  return wakeTypes?.length ? [...new Set(wakeTypes)].sort() : undefined
}
