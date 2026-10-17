import { z } from 'zod'
import { Identifier } from './structured-agent-session-identifiers'

/** Host-set marker naming the project group whose binding chose an account home. Optional on the
 *  wire, so an older peer that never sends or reads it stays compatible. */
export const AccountHomeBinding = z
  .object({ kind: z.literal('project-group'), groupId: Identifier('Invalid project group id') })
  .strict()
