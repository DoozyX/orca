import * as z from 'zod'
import { lazyZodSchema } from '../../schema/lazy-zod-schema'
import { isFeatureInteractionId } from '../../feature-education/interactions/feature-interactions'
import type { FeatureInteractionId } from '../../feature-education/interactions/feature-interaction-catalog'

export const FeatureInteractionRecord = lazyZodSchema(() =>
  z
    .object({
      firstInteractedAt: z.number().finite().nonnegative(),
      interactionCount: z.number().int().positive().optional()
    })
    .strict()
)

export const FeatureInteractions = lazyZodSchema(() =>
  z.record(z.string(), FeatureInteractionRecord).superRefine((value, ctx) => {
    for (const id of Object.keys(value)) {
      if (!isFeatureInteractionId(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown feature interaction id: ${id}`,
          path: [id]
        })
      }
    }
  })
)

export const FeatureInteractionIdParam = lazyZodSchema(() =>
  z.custom<FeatureInteractionId>(isFeatureInteractionId, {
    message: 'Unknown feature interaction id'
  })
)
