import type { DeliveryRow, MessageRow, MessageType } from '../../types'
import { OrchestrationError } from '../../orchestration-error'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { exposeDeliveryTimestamps, exposeMessageListTimestamps } from '../utc-timestamp'
import { requireMailboxConsumer } from './mailbox-consumer'
import { ORCHESTRATION_DELIVERY_BATCH_LIMIT } from './mailbox-routing-page'

export function getDeliveryRaw(this: OrchestrationDb, id: string): DeliveryRow | undefined {
  return this.db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as DeliveryRow | undefined
}

export function getDeliveryMessages(this: OrchestrationDb, delivery: DeliveryRow): MessageRow[] {
  const ids = JSON.parse(delivery.message_ids) as string[]
  if (ids.length === 0) {
    return []
  }
  const rows = this.db
    .prepare(`SELECT * FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as MessageRow[]
  const byId = new Map(rows.map((row) => [row.id, row]))
  return exposeMessageListTimestamps(
    ids.map((id) => byId.get(id)).filter((row): row is MessageRow => row !== undefined)
  )
}

function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',')
}

// A typed wait replays only a batch holding an unread row of its types; an untyped check, any batch.
function selectReplayableDelivery(
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
function typedWaitKey(wakeTypes: MessageType[] | undefined): MessageType[] | undefined {
  return wakeTypes?.length ? [...new Set(wakeTypes)].sort() : undefined
}

export function getOrCreateMailboxDelivery(
  this: OrchestrationDb,
  params: {
    runId: string
    mailboxHandle: string
    consumerGeneration: number
    consumerSource?: 'dispatch' | 'attachment'
    limit?: number
    wakeTypes?: MessageType[]
  }
): { delivery: DeliveryRow; messages: MessageRow[]; replayed: boolean } | undefined {
  const limit = Math.min(
    Math.max(params.limit ?? ORCHESTRATION_DELIVERY_BATCH_LIMIT, 1),
    ORCHESTRATION_DELIVERY_BATCH_LIMIT
  )
  const wakeTypes = typedWaitKey(params.wakeTypes)
  this.db.exec('BEGIN IMMEDIATE')
  try {
    requireMailboxConsumer(this, params)
    const existing = selectReplayableDelivery(this, params.mailboxHandle, wakeTypes)
    if (existing) {
      if (existing.consumer_generation !== params.consumerGeneration) {
        throw new OrchestrationError(
          'consumer_fenced',
          'This mailbox Delivery belongs to a fenced consumer generation.'
        )
      }
      const messages = this.getDeliveryMessages(existing)
      this.db.exec('COMMIT')
      return { delivery: exposeDeliveryTimestamps(existing), messages, replayed: true }
    }
    const typeClause = wakeTypes ? `AND type IN (${sqlPlaceholders(wakeTypes.length)})` : ''
    const messages = exposeMessageListTimestamps(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SELECT * FROM messages returns MessageRow columns; the adapter exposes unknown.
      this.db
        .prepare(
          `SELECT * FROM messages
           WHERE run_id = ? AND to_handle = ? AND read = 0
             AND delivery_contract = 'current_delivery' ${typeClause}
           ORDER BY sequence ASC LIMIT ?`
        )
        .all(params.runId, params.mailboxHandle, ...(wakeTypes ?? []), limit) as MessageRow[]
    )
    if (messages.length === 0) {
      this.db.exec('COMMIT')
      return undefined
    }
    const deliveryId = generateId('delivery')
    this.db
      .prepare(
        `INSERT INTO deliveries (
           id, run_id, mailbox_handle, consumer_generation, message_ids, wake_types
         ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        deliveryId,
        params.runId,
        params.mailboxHandle,
        params.consumerGeneration,
        JSON.stringify(messages.map((message) => message.id)),
        wakeTypes ? JSON.stringify(wakeTypes) : null
      )
    const delivery = this.getDeliveryRaw(deliveryId) as DeliveryRow
    this.db.exec('COMMIT')
    return { delivery: exposeDeliveryTimestamps(delivery), messages, replayed: false }
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
}

export function acknowledgeMailboxDelivery(
  this: OrchestrationDb,
  params: {
    runId: string
    mailboxHandle: string
    consumerGeneration: number
    consumerSource?: 'dispatch' | 'attachment'
    deliveryId: string
  }
): { delivery: DeliveryRow; duplicate: boolean } {
  this.db.exec('BEGIN IMMEDIATE')
  try {
    requireMailboxConsumer(this, params)
    const delivery = this.getDeliveryRaw(params.deliveryId)
    if (
      !delivery ||
      delivery.run_id !== params.runId ||
      delivery.mailbox_handle !== params.mailboxHandle
    ) {
      throw new OrchestrationError(
        'stale_delivery',
        !delivery && this.getMessageById(params.deliveryId)
          ? `${params.deliveryId} is a message id, not a delivery id. Acknowledge the batch with the deliveryId field from the check response; process the entire batch before acknowledging.`
          : `Delivery ${params.deliveryId} does not belong to this mailbox. --ack requires a delivery_* ID returned by orchestration check; process the entire batch before acknowledging.`
      )
    }
    if (
      delivery.consumer_generation !== params.consumerGeneration ||
      delivery.status === 'fenced'
    ) {
      throw new OrchestrationError(
        'consumer_fenced',
        'This mailbox Delivery belongs to a fenced consumer generation.'
      )
    }
    if (delivery.status === 'acknowledged') {
      this.db.exec('COMMIT')
      return { delivery: exposeDeliveryTimestamps(delivery), duplicate: true }
    }
    const messageIds = JSON.parse(delivery.message_ids) as string[]
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',')
      this.db
        .prepare(
          `UPDATE messages
           SET read = 1, pointer_enter_pending = 0, pointer_pty_id = NULL,
               pointer_process_incarnation = NULL
           WHERE id IN (${placeholders})`
        )
        .run(...messageIds)
    }
    this.db
      .prepare(
        "UPDATE deliveries SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?"
      )
      .run(delivery.id)
    const acknowledged = this.getDeliveryRaw(delivery.id) as DeliveryRow
    this.db.exec('COMMIT')
    return { delivery: exposeDeliveryTimestamps(acknowledged), duplicate: false }
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
}

/** With `wakeTypes`, only a batch that typed wait would replay counts. */
export function hasOutstandingMailboxDelivery(
  this: OrchestrationDb,
  mailboxHandle: string,
  wakeTypes?: MessageType[]
): boolean {
  const typed = typedWaitKey(wakeTypes)
  if (typed) {
    return selectReplayableDelivery(this, mailboxHandle, typed) !== undefined
  }
  return Boolean(
    this.db
      .prepare('SELECT 1 FROM outstanding_deliveries WHERE mailbox_handle = ? LIMIT 1')
      .get(mailboxHandle)
  )
}

export function fenceUnacknowledgedMailboxDeliveries(
  this: OrchestrationDb,
  mailboxHandle: string
): void {
  this.db
    .prepare(
      "UPDATE deliveries SET status = 'fenced' WHERE mailbox_handle = ? AND status = 'outstanding'"
    )
    .run(mailboxHandle)
}

export type RoleMailboxDeliveryMethods = {
  getDeliveryRaw: typeof getDeliveryRaw
  getDeliveryMessages: typeof getDeliveryMessages
  getOrCreateMailboxDelivery: typeof getOrCreateMailboxDelivery
  acknowledgeMailboxDelivery: typeof acknowledgeMailboxDelivery
  hasOutstandingMailboxDelivery: typeof hasOutstandingMailboxDelivery
  fenceUnacknowledgedMailboxDeliveries: typeof fenceUnacknowledgedMailboxDeliveries
}

export function attachRoleMailboxDelivery(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    getDeliveryRaw,
    getDeliveryMessages,
    getOrCreateMailboxDelivery,
    acknowledgeMailboxDelivery,
    hasOutstandingMailboxDelivery,
    fenceUnacknowledgedMailboxDeliveries
  })
}
