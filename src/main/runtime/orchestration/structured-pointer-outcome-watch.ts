/**
 * What the structured pointer lane did with one sent message, so a send receipt reports the lane's
 * own answer rather than predicting it from the session's state at commit time.
 */

export type StructuredSendDelivery = 'queued' | 'injected'

type PendingObservation = {
  messageId: string
  finish: (delivery: StructuredSendDelivery | undefined) => void
}

export class StructuredPointerOutcomeWatch {
  private readonly pending = new Map<string, Set<PendingObservation>>()

  constructor(private readonly deps: { isStructuredMailbox: (mailboxHandle: string) => boolean }) {}

  /** Registers synchronously, so it is in place before the send's nudge microtask runs. */
  observe(
    mailboxHandle: string,
    messageId: string,
    timeoutMs: number
  ): Promise<StructuredSendDelivery | undefined> {
    if (!this.deps.isStructuredMailbox(mailboxHandle)) {
      return Promise.resolve(undefined)
    }
    const observers = this.pending.get(mailboxHandle) ?? new Set<PendingObservation>()
    this.pending.set(mailboxHandle, observers)
    return new Promise((resolve) => {
      const observation: PendingObservation = { messageId, finish: () => undefined }
      const timer = setTimeout(() => observation.finish(undefined), timeoutMs)
      timer.unref?.()
      observation.finish = (delivery) => {
        clearTimeout(timer)
        observers.delete(observation)
        if (observers.size === 0 && this.pending.get(mailboxHandle) === observers) {
          this.pending.delete(mailboxHandle)
        }
        resolve(delivery)
      }
      observers.add(observation)
    })
  }

  /** The lane's first answer for a mailbox settles every observer of it; a batch without the
   *  observed message claims nothing for it. */
  settle(input: {
    mailboxHandle: string
    messageIds: readonly string[]
    delivery: StructuredSendDelivery | null
  }): void {
    for (const observation of Array.from(this.pending.get(input.mailboxHandle) ?? [])) {
      observation.finish(
        input.messageIds.includes(observation.messageId) && input.delivery !== null
          ? input.delivery
          : undefined
      )
    }
  }
}
