import { z } from 'zod'
import { WORKER_TERMINAL_TAKEOVER_SOURCES } from '../../../../orchestration/worker-terminal-ownership'
import type { exposeWorkerTerminalResource } from '../worker/worker-terminal-resource-presentation'

type ExposedWorkerTerminalResource = ReturnType<typeof exposeWorkerTerminalResource>

export const RemoteTakeoverEvidenceSchema = z.object({
  source: z.enum([...WORKER_TERMINAL_TAKEOVER_SOURCES, 'unrecorded']),
  at: z.string().nullable()
})

const RemoteWorkerTerminalResourceSchema = z.object({
  id: z.string(),
  ownershipState: z.string(),
  releaseState: z.string(),
  retainedReason: z.string().nullable(),
  terminalHandle: z.string(),
  worktreeId: z.string().nullable(),
  endpointId: z.string().nullable(),
  endpointIncarnation: z.string().nullable(),
  originDispatchId: z.string(),
  ownerDispatchId: z.string(),
  releaseRequestedAt: z.string().nullable(),
  releaseCompletedAt: z.string().nullable(),
  releaseError: z.string().nullable(),
  recoveryAttemptCount: z.number(),
  lastRecoveryAt: z.string().nullable(),
  archive: z.object({ source: z.string().nullable(), status: z.string().nullable() }),
  takeover: RemoteTakeoverEvidenceSchema.nullable()
}) satisfies z.ZodType<ExposedWorkerTerminalResource>

/** The execution host's terminal resource; undefined from a host that predates it or sent junk. */
export function parseRemoteWorkerTerminalResource(
  value: unknown
): ExposedWorkerTerminalResource | undefined {
  const parsed = RemoteWorkerTerminalResourceSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
