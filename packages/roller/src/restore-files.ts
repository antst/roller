import { lstat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'

/** Host-only hard-link check for capture eligibility. */
export async function hasMultipleHardLinks(path: string): Promise<boolean> {
  return (await lstat(path)).nlink > 1
}

/** Native removal, retaining the host-only regular-file/hard-link eligibility guard. */
export async function deleteRestoredFile(
  ctx: Context,
  target: FsTarget,
  policy: SandboxExecutionPolicy,
  exists: boolean,
  signal: AbortSignal,
): Promise<void> {
  if (!exists) return
  const hostPath = ctx.fs.processPath(target)
  if (ctx.fs.processPathFromHostPath(hostPath) !== hostPath) {
    throw new Error(`cannot delete ${target.displayPath}: filesystem is not host-local`)
  }
  signal.throwIfAborted()
  const info = await lstat(hostPath)
  if (!info.isFile()) throw new Error(`cannot delete ${target.displayPath}: not a regular file`)
  if (info.nlink > 1) throw new Error(`cannot delete ${target.displayPath}: hard-linked file`)
  signal.throwIfAborted()
  await ctx.fs.deleteFile(target, undefined, signal, policy)
}
