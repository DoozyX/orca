import { ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS } from '../../../../../../shared/orchestration-timing-budgets'
import type { OrcaRuntimeService } from '../../../../orca-runtime'

// Why: lifecycle reports and gates settle through their own receipts, not a chat pointer.
const UNOBSERVED_SEND_TYPES: ReadonlySet<string> = new Set([
  'worker_done',
  'heartbeat',
  'escalation',
  'decision_gate'
])

/** Adds the structured lane's own answer for this message, never a prediction (#23). */
export async function withStructuredSendDelivery(
  runtime: OrcaRuntimeService,
  type: string | undefined,
  receipt: unknown
): Promise<unknown> {
  if (
    (type !== undefined && UNOBSERVED_SEND_TYPES.has(type)) ||
    typeof receipt !== 'object' ||
    receipt === null ||
    !('message' in receipt)
  ) {
    return receipt
  }
  const { message } = receipt
  if (
    typeof message !== 'object' ||
    message === null ||
    !('id' in message) ||
    !('to_handle' in message)
  ) {
    return receipt
  }
  const { id, to_handle: toHandle } = message
  if (typeof id !== 'string' || typeof toHandle !== 'string' || toHandle.startsWith('run:')) {
    return receipt
  }
  const delivery = await runtime.structuredSendDeliveryWatch.observe(
    toHandle,
    id,
    ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS
  )
  return delivery === undefined ? receipt : { ...receipt, delivery }
}
