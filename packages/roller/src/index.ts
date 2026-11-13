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
export const inject = ['commands', 'fs', 'sandboxPolicy', 'sessions', 'storageDomain', 'workingDirectory']

export async function apply(ctx: Context): Promise<void> {
  await ctx.effect(async function* () {
    const domain = await ctx.storageDomain.open(rollerDomainSpec)
    // Cordis collects this disposer even if disposal occurred during open,
    // and stops the generator before advancing to any further ctx access.
    yield () => domain.close()
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

    ctx.on('fs/delete-intent', async (target, actor, next) => {
      await journal.capture(target, actor)
      return next()
    }, { prepend: true })
  })
}
