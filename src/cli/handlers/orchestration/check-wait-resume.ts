import type { z } from 'zod'
import { ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS } from '../../../shared/orchestration-message-wait-timeout'
import type { OrchestrationMutationRequestShowResult } from '../../../shared/orchestration-mutation-request'
import type { CheckParams } from '../../../shared/rpc-contract/orchestration-params'
import {
  RuntimeClientError,
  type RuntimeClient,
  type RuntimeRpcSuccess
} from '../../runtime-client'
import { callOrchestrationMutation } from './mutation-request'

export const CHECK_WAIT_RESUME_LIMIT = 3

export type OrchestrationCheckParams = z.input<typeof CheckParams>

/**
 * A dropped connection ends the host-side wait as an empty `connectionLost` receipt, and replaying
 * that request id only returns the receipt again. So a lost wait asks request-show what happened
 * and, when nothing was delivered, resumes as a fresh request for the time it has left.
 */
export async function callCheckWaitWithResume<T>(
  client: RuntimeClient,
  flags: Map<string, string | boolean>,
  params: OrchestrationCheckParams,
  timeoutMs: number | undefined
): Promise<RuntimeRpcSuccess<T>> {
  // Why: an omitted timeout is the host's finite default, so every resume spends from that budget too.
  const deadline = Date.now() + (timeoutMs ?? ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS)
  let callFlags = flags
  let callParams = params
  for (let resumes = 0; ; resumes += 1) {
    try {
      return await callOrchestrationMutation<T>(
        client,
        callFlags,
        'orchestration.check',
        callParams
      )
    } catch (error) {
      const requestId = lostConnectionRequestId(error)
      if (!requestId || resumes === CHECK_WAIT_RESUME_LIMIT) {
        throw error
      }
      // Any lookup failure (older server, runtime still down) leaves the outcome unknown.
      const shown = await client
        .call<OrchestrationMutationRequestShowResult>('orchestration.requestShow', {
          request: requestId
        })
        .catch(() => undefined)
      const receipt = shown?.result.receipt
      if (shown?.result.state !== 'completed' || typeof receipt !== 'object' || receipt === null) {
        throw error
      }
      const remainingMs = deadline - Date.now()
      if (!isEmptyLostWait(receipt) || remainingMs <= 0) {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a completed orchestration.check receipt is that call's stored result.
        return { ...shown, result: receipt as T }
      }
      // Why: a --retry-request id would only replay the lost receipt, so the resume mints its own.
      callFlags = new Map([...flags].filter(([name]) => name !== 'retry-request'))
      callParams = { ...params, ack: undefined, timeoutMs: remainingMs }
    }
  }
}

function lostConnectionRequestId(error: unknown): string | undefined {
  if (!(error instanceof RuntimeClientError) || error.code !== 'runtime_unavailable') {
    return undefined
  }
  const data: unknown = error.data
  return typeof data === 'object' &&
    data !== null &&
    'orchestrationRequestId' in data &&
    typeof data.orchestrationRequestId === 'string'
    ? data.orchestrationRequestId
    : undefined
}

function isEmptyLostWait(receipt: object): boolean {
  return (
    'connectionLost' in receipt &&
    receipt.connectionLost === true &&
    !('deliveryId' in receipt && receipt.deliveryId)
  )
}
