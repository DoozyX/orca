import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LEGACY_RUN_ID, OrchestrationDb } from './db'
import type { MessageType } from './types'
import { createRootDispatch } from './db/root-dispatch-test-fixture'

describe('OrchestrationDb Run state', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => {
    db?.close()
  })

  function createDb(): OrchestrationDb {
    db = new OrchestrationDb(':memory:')
    return db
  }

  function createBoundRun(d: OrchestrationDb) {
    return d.createRun({
      objective: 'Mailbox test',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'tab_coord:11111111-1111-4111-8111-111111111111'
    })
  }

  describe('Run deliveries', () => {
    it('returns one bounded FIFO batch and replays it until acknowledgment', () => {
      const d = createDb()
      const run = createBoundRun(d)
      for (let index = 0; index < 55; index++) {
        d.insertMessage({
          from: 'worker',
          to: `run:${run.id}`,
          subject: `message ${index}`,
          runId: run.id
        })
      }

      const first = d.getOrCreateRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation
      })
      const replay = d.getOrCreateRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation
      })

      expect(first?.messages).toHaveLength(50)
      expect(first?.messages[0].subject).toBe('message 0')
      expect(first?.messages[49].subject).toBe('message 49')
      expect(replay?.delivery.id).toBe(first?.delivery.id)
      expect(replay?.replayed).toBe(true)

      d.acknowledgeRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation,
        deliveryId: first!.delivery.id
      })
      const next = d.getOrCreateRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation
      })
      expect(next?.messages.map((message) => message.subject)).toEqual([
        'message 50',
        'message 51',
        'message 52',
        'message 53',
        'message 54'
      ])
    })

    it('acknowledges the whole batch idempotently without consuming newer mail', () => {
      const d = createDb()
      const run = createBoundRun(d)
      d.insertMessage({ from: 'a', to: `run:${run.id}`, subject: 'first', runId: run.id })
      const delivery = d.getOrCreateRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation
      })!
      d.insertMessage({ from: 'b', to: `run:${run.id}`, subject: 'newer', runId: run.id })

      const firstAck = d.acknowledgeRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation,
        deliveryId: delivery.delivery.id
      })
      const duplicateAck = d.acknowledgeRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation,
        deliveryId: delivery.delivery.id
      })

      expect(firstAck.duplicate).toBe(false)
      expect(duplicateAck.duplicate).toBe(true)
      expect(
        d
          .getOrCreateRunDelivery({
            runId: run.id,
            consumerGeneration: run.consumer_generation
          })
          ?.messages.map((message) => message.subject)
      ).toEqual(['newer'])
    })

    describe('typed waits', () => {
      const WAKE_TYPES: MessageType[] = ['worker_done', 'escalation', 'question']

      function insert(d: OrchestrationDb, runId: string, subject: string, type: MessageType) {
        return d.insertMessage({ from: 'worker', to: `run:${runId}`, subject, type, runId })
      }
      function deliveryCount(d: OrchestrationDb): unknown {
        return d.db.prepare('SELECT COUNT(*) AS count FROM deliveries').get()
      }

      it('builds a delivery of only matching rows and leaves heartbeats unread', () => {
        const d = createDb()
        const run = createBoundRun(d)
        const heartbeats = Array.from({ length: 60 }, (_, index) =>
          insert(d, run.id, `heartbeat ${index}`, 'heartbeat')
        )
        const done = insert(d, run.id, 'done', 'worker_done')

        const delivery = d.getOrCreateRunDelivery({
          runId: run.id,
          consumerGeneration: run.consumer_generation,
          wakeTypes: WAKE_TYPES
        })

        expect(delivery?.messages.map((message) => message.id)).toEqual([done.id])
        expect(delivery?.replayed).toBe(false)
        expect(heartbeats.map((heartbeat) => d.getMessageById(heartbeat.id)?.read)).toEqual(
          heartbeats.map(() => 0)
        )
      })

      it('leaves a nonmatching outstanding delivery alone and never returns it', () => {
        const d = createDb()
        const run = createBoundRun(d)
        const params = { runId: run.id, consumerGeneration: run.consumer_generation }
        const heartbeats = [0, 1, 2].map((index) =>
          insert(d, run.id, `heartbeat ${index}`, 'heartbeat')
        )
        const d1 = d.getOrCreateRunDelivery(params)!
        d.db
          .prepare("UPDATE deliveries SET created_at = '2026-01-01 00:00:00' WHERE id = ?")
          .run(d1.delivery.id)
        expect(d.getOrCreateRunDelivery({ ...params, wakeTypes: ['question'] })).toBeUndefined()
        const question = insert(d, run.id, 'decide', 'question')

        const d2 = d.getOrCreateRunDelivery({ ...params, wakeTypes: ['question'] })

        expect(d2?.delivery.id).not.toBe(d1.delivery.id)
        expect(d2?.messages.map((message) => message.id)).toEqual([question.id])
        expect(d2?.replayed).toBe(false)
        expect(d.getDeliveryRaw(d1.delivery.id)?.status).toBe('outstanding')
        expect(heartbeats.map((heartbeat) => d.getMessageById(heartbeat.id)?.read)).toEqual([
          0, 0, 0
        ])
        // An untyped check keeps whole-FIFO replay: the oldest outstanding delivery first.
        expect(d.getOrCreateRunDelivery(params)).toMatchObject({
          delivery: { id: d1.delivery.id },
          replayed: true
        })
        d.acknowledgeRunDelivery({ ...params, deliveryId: d1.delivery.id })
        expect(d.getOrCreateRunDelivery(params)).toMatchObject({
          delivery: { id: d2!.delivery.id },
          replayed: true
        })
        d.acknowledgeRunDelivery({ ...params, deliveryId: d2!.delivery.id })
        const status = insert(d, run.id, 'status', 'status')
        const later = insert(d, run.id, 'later heartbeat', 'heartbeat')
        expect(d.getOrCreateRunDelivery(params)?.messages.map((message) => message.id)).toEqual([
          status.id,
          later.id
        ])
      })

      it('replays its own un-acked matching delivery', () => {
        const d = createDb()
        const run = createBoundRun(d)
        const params = { runId: run.id, consumerGeneration: run.consumer_generation }
        insert(d, run.id, 'done', 'worker_done')
        const first = d.getOrCreateRunDelivery({ ...params, wakeTypes: WAKE_TYPES })!

        expect(d.getOrCreateRunDelivery({ ...params, wakeTypes: WAKE_TYPES })).toMatchObject({
          delivery: { id: first.delivery.id },
          replayed: true
        })
      })

      it('replays a mixed untyped delivery whole when it holds a matching row', () => {
        const d = createDb()
        const run = createBoundRun(d)
        const params = { runId: run.id, consumerGeneration: run.consumer_generation }
        const heartbeat = insert(d, run.id, 'heartbeat', 'heartbeat')
        const done = insert(d, run.id, 'done', 'worker_done')
        const mixed = d.getOrCreateRunDelivery(params)!
        const before = deliveryCount(d)

        const replay = d.getOrCreateRunDelivery({ ...params, wakeTypes: ['worker_done'] })

        expect(replay?.delivery.id).toBe(mixed.delivery.id)
        expect(replay?.replayed).toBe(true)
        expect(replay?.messages.map((message) => message.id)).toEqual([heartbeat.id, done.id])
        expect(deliveryCount(d)).toEqual(before)
      })
    })

    it('fences an outstanding batch when the Run consumer changes', () => {
      const d = createDb()
      const run = createBoundRun(d)
      d.insertMessage({ from: 'a', to: `run:${run.id}`, subject: 'one', runId: run.id })
      const oldDelivery = d.getOrCreateRunDelivery({
        runId: run.id,
        consumerGeneration: run.consumer_generation
      })!
      const rebound = d.bindRun({
        runId: run.id,
        coordinatorHandle: 'term_new',
        coordinatorPaneKey: 'tab_new:22222222-2222-4222-9222-222222222222'
      })!

      let fencedError: unknown
      try {
        d.acknowledgeRunDelivery({
          runId: run.id,
          consumerGeneration: run.consumer_generation,
          deliveryId: oldDelivery.delivery.id
        })
      } catch (error) {
        fencedError = error
      }
      expect(fencedError).toMatchObject({ code: 'consumer_fenced' })
      const replacement = d.getOrCreateRunDelivery({
        runId: run.id,
        consumerGeneration: rebound.consumer_generation
      })
      expect(replacement?.delivery.id).not.toBe(oldDelivery.delivery.id)
      expect(replacement?.messages.map((message) => message.subject)).toEqual(['one'])
    })

    it('does not move a mismatched Run through another Run Dispatch mailbox', () => {
      const d = createDb()
      const runA = createBoundRun(d)
      const runB = d.createRun({
        objective: 'Dispatch owner',
        coordinatorHandle: 'term_other',
        coordinatorPaneKey: 'tab_other:22222222-2222-4222-9222-222222222222'
      })
      const task = d.createTask({ spec: 'work', runId: runB.id })
      const dispatch = createRootDispatch(d, task.id, 'term_worker')
      const mismatched = d.insertMessage({
        from: 'worker',
        to: `dispatch:${dispatch.id}`,
        subject: 'wrong Run',
        runId: runA.id
      })

      expect(d.routeUnreadDispatchMailboxToRunMailbox(dispatch.id, runB.id)).toMatchObject({
        routedCount: 0,
        hasMore: false
      })
      expect(d.getMessageById(mismatched.id)?.to_handle).toBe(`dispatch:${dispatch.id}`)
    })

    it('replays an outstanding batch after reopening the database', () => {
      const dir = mkdtempSync(join(tmpdir(), 'orca-delivery-'))
      const dbPath = join(dir, 'orchestration.db')
      try {
        const firstDb = new OrchestrationDb(dbPath)
        const run = createBoundRun(firstDb)
        firstDb.insertMessage({
          from: 'a',
          to: `run:${run.id}`,
          subject: 'survives',
          runId: run.id
        })
        const first = firstDb.getOrCreateRunDelivery({
          runId: run.id,
          consumerGeneration: run.consumer_generation
        })!
        firstDb.close()

        const reopened = new OrchestrationDb(dbPath)
        db = reopened
        const replay = reopened.getOrCreateRunDelivery({
          runId: run.id,
          consumerGeneration: run.consumer_generation
        })
        expect(replay?.delivery.id).toBe(first.delivery.id)
        expect(replay?.messages[0].subject).toBe('survives')
      } finally {
        db?.close()
        db = undefined
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('lightweight Run scope', () => {
    it('binds creation to one pane and fences that pane when it creates another Run', () => {
      const d = createDb()
      const first = d.createRun({
        objective: 'First objective',
        coordinatorHandle: 'term_first',
        coordinatorPaneKey: 'tab_a:11111111-1111-4111-8111-111111111111'
      })
      expect(first).toMatchObject({ consumer_generation: 1, legacy: 0 })
      expect(d.getCurrentRunForPane('tab_reminted:11111111-1111-4111-8111-111111111111')?.id).toBe(
        first.id
      )

      const second = d.createRun({
        objective: 'Second objective',
        coordinatorHandle: 'term_second',
        coordinatorPaneKey: 'tab_b:11111111-1111-4111-8111-111111111111'
      })
      expect(d.getRun(first.id)).toMatchObject({
        coordinator_handle: null,
        coordinator_pane_key: null,
        consumer_generation: 2
      })
      expect(d.getCurrentRunForPane('tab_b:11111111-1111-4111-8111-111111111111')?.id).toBe(
        second.id
      )
    })

    it('rebinds a Run by incrementing its consumer generation', () => {
      const d = createDb()
      const run = d.createRun({
        objective: 'Move coordinator',
        coordinatorHandle: 'term_old',
        coordinatorPaneKey: 'tab_old:11111111-1111-4111-8111-111111111111'
      })

      expect(
        d.bindRun({
          runId: run.id,
          coordinatorHandle: 'term_new',
          coordinatorPaneKey: 'tab_new:22222222-2222-4222-9222-222222222222'
        })
      ).toMatchObject({
        coordinator_handle: 'term_new',
        consumer_generation: 2
      })
      expect(d.getCurrentRunForPane('tab_old:11111111-1111-4111-8111-111111111111')).toBeUndefined()
      expect(
        d.bindRun({
          runId: LEGACY_RUN_ID,
          coordinatorHandle: 'term_new',
          coordinatorPaneKey: 'tab_new:22222222-2222-4222-9222-222222222222'
        })
      ).toBeUndefined()
    })

    it('associates task, dispatch, message, and gate rows with the selected Run', () => {
      const d = createDb()
      const run = d.createRun({
        objective: 'Scoped work',
        coordinatorHandle: 'term_coord',
        coordinatorPaneKey: 'tab_coord:11111111-1111-4111-8111-111111111111'
      })
      const task = d.createTask({ spec: 'work', runId: run.id })
      const dispatch = createRootDispatch(d, task.id, 'term_worker')
      const message = d.insertMessage({
        runId: run.id,
        from: 'term_worker',
        to: 'term_coord',
        subject: 'status'
      })
      const gate = d.createGate({ taskId: task.id, question: 'Continue?' })

      expect(task.run_id).toBe(run.id)
      expect(dispatch.run_id).toBe(run.id)
      expect(message.run_id).toBe(run.id)
      expect(gate.run_id).toBe(run.id)
    })
  })
})
