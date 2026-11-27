import * as z from 'zod'
import { lazyZodSchema } from '../schema/lazy-zod-schema'

export const AccountHome = lazyZodSchema(() =>
  z
    .object({
      variable: z.enum(['CLAUDE_CONFIG_DIR', 'CODEX_HOME']),
      path: z.string().min(1).max(4096)
    })
    .strict()
)
