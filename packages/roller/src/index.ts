import type { Context } from '@deepseek-ai/cordis'
import { CaptureJournal } from './capture.js'
import { registerRestoreCommand } from './restore.js'
import { rollerDomainSpec } from './spec.js'

export {
  MAX_CHECKPOINT_BYTES,
  RETAINED_TURNS,
  checkpointRecordSchema,
  rollerDomainSpec,
} from './spec.js'
export type { CheckpointKey, CheckpointRecord } from './spec.js'
export { formatRestoreReport } from './format.js'
export type { RestoreFailure, RestoreReport } from './format.js'

export const name = 'roller'
export const inject = ['commands', 'fs', 'sandboxPolicy', 'sessions', 'storageDomain']

export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(rollerDomainSpec)
  ctx.effect(() => () => domain.close())
  const journal = new CaptureJournal(ctx, domain.table('checkpoints'))
  ctx.effect(() => registerRestoreCommand(ctx, domain.table('checkpoints')))

  ctx.on('fs/write-intent', async (target, actor, next) => {
    await journal.capture(target, actor)
    return next()
  }, { prepend: true })

  ctx.on('fs/edit-intent', async (target, actor, next) => {
    await journal.capture(target, actor)
    return next()
  }, { prepend: true })
}
