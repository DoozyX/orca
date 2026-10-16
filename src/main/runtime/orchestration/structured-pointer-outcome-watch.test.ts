import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS } from '../../../shared/orchestration-timing-budgets'
import { OrchestrationDb } from './db'
import {
  OrchestrationStructuredMailboxPointerDelivery,
  type StructuredMailboxPointerHost,
  type StructuredPointerSendOutcome
} from './structured-mailbox-pointer-delivery'
import {
  structuredPointerBatchFingerprint,
  type StructuredPointerSubmission
} from './structured-pointer-operation-id'
import { StructuredPointerOutcomeWatch } from './structured-pointer-outcome-watch'

const MAILBOX = 'structworker_watch'
const SESSION = 'session-watch'

describe('structured pointer outcome watch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function watch(): StructuredPointerOutcomeWatch {
    return new StructuredPointerOutcomeWatch({
      isStructuredMailbox: (mailboxHandle) => mailboxHandle === MAILBOX
    })
  }

  it('answers nothing at once for a mailbox the structured lane does not serve', async () => {
    await expect(
      watch().observe('term_agent', 'msg_1', ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS)
    ).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['queued', 'queued'],
    ['injected', 'injected'],
    [null, undefined]
  ] as const)('reports the lane answer %s for the observed message', async (delivery, expected) => {
    const outcomes = watch()
    const observed = outcomes.observe(MAILBOX, 'msg_1', ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS)

    outcomes.settle({ mailboxHandle: MAILBOX, messageIds: ['msg_0', 'msg_1'], delivery })

    await expect(observed).resolves.toBe(expected)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('claims nothing when the settled batch does not hold the message', async () => {
    const outcomes = watch()
    const observed = outcomes.observe(MAILBOX, 'msg_1', ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS)

    outcomes.settle({ mailboxHandle: MAILBOX, messageIds: ['msg_0'], delivery: 'queued' })

    await expect(observed).resolves.toBeUndefined()
  })

  it('ignores another mailbox and times out without an answer', async () => {
    const outcomes = watch()
    let answer: string | undefined = 'pending'
    void outcomes
      .observe(MAILBOX, 'msg_1', ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS)
      .then((delivery) => {
        answer = delivery
      })

    outcomes.settle({ mailboxHandle: 'dispatch:other', messageIds: ['msg_1'], delivery: 'queued' })
    await vi.advanceTimersByTimeAsync(ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS - 1)
    expect(answer).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    expect(answer).toBeUndefined()
    // The entry is gone: a late answer for the message resolves nothing.
    outcomes.settle({ mailboxHandle: MAILBOX, messageIds: ['msg_1'], delivery: 'queued' })
    expect(answer).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('structured pointer lane answers through the watch', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  function lane(options: {
    send?: StructuredMailboxPointerHost['send']
    attached?: boolean
    submissions?: StructuredPointerSubmission[]
  }) {
    const outcomes = new StructuredPointerOutcomeWatch({
      isStructuredMailbox: (mailboxHandle) => mailboxHandle === MAILBOX
    })
    const send = vi.fn<StructuredMailboxPointerHost['send']>(
      options.send ?? (async () => ({ kind: 'sent', state: 'accepted' }))
    )
    const delivery = new OrchestrationStructuredMailboxPointerDelivery({
      getDb: () => db,
      getMessageWaiters: () => undefined,
      resolveStructuredTarget: (mailboxHandle) =>
        mailboxHandle === MAILBOX ? { sessionId: SESSION, dispatchId: null } : null,
      getCliCommand: () => 'orca-dev',
      senderName: () => null,
      host: {
        readSessionFacts: async () =>
          options.attached === false ? null : { submissions: options.submissions ?? [] },
        currentFence: () => 1,
        currentContextClearOperationId: () => undefined,
        send
      },
      onAttemptSettled: (input) => outcomes.settle(input)
    })
    /** Registers the observer, then nudges the lane, in the send path's order. */
    const observeAndNudge = (messageId: string) => {
      const observed = outcomes.observe(MAILBOX, messageId, ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS)
      delivery.deliverForHandle(MAILBOX)
      return observed
    }
    return {
      send,
      observeAndNudge,
      sendMessage: () => observeAndNudge(commitMessage().id)
    }
  }

  function commitMessage() {
    return db.insertMessage({ from: 'term_coord', to: MAILBOX, subject: 'addendum' })
  }

  const answers = (outcome: StructuredPointerSendOutcome) => async () => outcome

  it('reports queued when the busy chat queue holds the pointer', async () => {
    await expect(lane({ send: answers({ kind: 'queued' }) }).sendMessage()).resolves.toBe('queued')
  })

  it('reports injected when the pointer started a turn on an idle chat', async () => {
    await expect(lane({}).sendMessage()).resolves.toBe('injected')
  })

  it('follows the send answer, not the session state at commit time', async () => {
    const running: StructuredPointerSubmission = {
      clientMessageId: 'person-turn',
      dispatchState: 'accepted',
      submittedAt: Date.now()
    }
    await expect(lane({ submissions: [running] }).sendMessage()).resolves.toBe('injected')
    await expect(
      lane({ submissions: [], send: answers({ kind: 'queued' }) }).sendMessage()
    ).resolves.toBe('queued')
  })

  it.each([
    ['a rejected send', answers({ kind: 'sent', state: 'rejected' })],
    ['an unknown send', answers({ kind: 'sent', state: 'unknown' })],
    ['an unattached session', answers({ kind: 'unattached' })]
  ])('claims nothing for %s', async (_label, send) => {
    await expect(lane({ send }).sendMessage()).resolves.toBeUndefined()
  })

  it('claims nothing when the session is not attached', async () => {
    const { send, sendMessage } = lane({ attached: false })
    await expect(sendMessage()).resolves.toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })

  it('claims nothing while an earlier pointer for the batch is still in flight', async () => {
    const message = commitMessage()
    db.putStructuredPointerOperation({
      mailbox_handle: MAILBOX,
      session_id: SESSION,
      operation_id: 'pending-pointer',
      batch_fingerprint: structuredPointerBatchFingerprint(SESSION, [message.id]),
      minted_at_ms: Date.now()
    })
    const { send, observeAndNudge } = lane({
      submissions: [
        { clientMessageId: 'pending-pointer', dispatchState: 'pending', submittedAt: Date.now() }
      ]
    })
    await expect(observeAndNudge(message.id)).resolves.toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })

  it('claims nothing while the mailbox holds an unacknowledged delivery', async () => {
    vi.spyOn(db, 'hasOutstandingMailboxDelivery').mockReturnValue(true)
    const { send, sendMessage } = lane({})
    await expect(sendMessage()).resolves.toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })

  it('claims nothing when the send never settles', async () => {
    vi.useFakeTimers()
    try {
      const { sendMessage } = lane({ send: () => new Promise(() => undefined) })
      const observed = sendMessage()
      await vi.advanceTimersByTimeAsync(ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS)
      await expect(observed).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
