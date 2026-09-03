import type { Context } from '@deepseek-ai/cordis'
import { CaptureJournal } from './capture.js'
import { registerRestoreCommand } from './restore.js'
import { rollerDomainSpec } from './spec.js'
import { warnIfUnsupportedDsh } from './version.js'

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
  // A real profile boot installs Loader before mounting config entries
  // (DSH packages/boot/app-boot/src/index.ts:779-789); direct test hosts do not.
  if (ctx.get('loader') !== undefined) warnIfUnsupportedDsh()
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
