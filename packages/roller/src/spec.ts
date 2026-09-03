import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

export const MAX_CHECKPOINT_BYTES = 1_048_576
export const RETAINED_TURNS = 100

export type CheckpointKey = string & { readonly __checkpointKey: unique symbol }

export const checkpointRecordSchema = z.object({
  sessionId: z.string(),
  turn: z.number().int().nonnegative(),
  targetKey: z.string(),
  relativePath: z.string(),
  displayPath: z.string(),
  before: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('absent') }),
    z.object({
      kind: z.literal('text'),
      contentBase64: z.string(),
      byteLength: z.number().int().nonnegative().max(MAX_CHECKPOINT_BYTES),
    }),
  ]),
})

export type CheckpointRecord = z.infer<typeof checkpointRecordSchema>

export const rollerDomainSpec = defineDomain({
  name: 'roller',
  version: 1,
  layout: 'per-record',
  tables: {
    checkpoints: domainTable<CheckpointKey, CheckpointRecord>(checkpointRecordSchema),
  },
})
