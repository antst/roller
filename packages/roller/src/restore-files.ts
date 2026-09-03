import { lstat, unlink } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'

/** Host-only hard-link check for capture eligibility. */
export async function hasMultipleHardLinks(path: string): Promise<boolean> {
  return (await lstat(path)).nlink > 1
}

/** The one host-local seam used until DSH exposes a filesystem delete primitive. */
export async function deleteRestoredFile(
  ctx: Context,
  target: FsTarget,
  policy: SandboxExecutionPolicy,
  exists: boolean,
  signal: AbortSignal,
): Promise<void> {
  if (!exists) return
  if (policy.mode === 'read-only') {
    throw new Error(`cannot delete ${target.displayPath}: file access denied under read-only mode`)
  }
  if (policy.mode === 'workspace-write') {
    const root = await ctx.fs.resolve(policy.workspaceRoot, { signal })
    if (!ctx.fs.contains(root, target)) {
      throw new Error(`cannot delete ${target.displayPath}: outside workspace-write root`)
    }
  }
  const hostPath = ctx.fs.processPath(target)
  if (ctx.fs.processPathFromHostPath(hostPath) !== hostPath) {
    throw new Error(`cannot delete ${target.displayPath}: filesystem is not host-local`)
  }
  signal.throwIfAborted()
  const info = await lstat(hostPath)
  if (!info.isFile()) throw new Error(`cannot delete ${target.displayPath}: not a regular file`)
  if (info.nlink > 1) throw new Error(`cannot delete ${target.displayPath}: hard-linked file`)
  signal.throwIfAborted()
  await unlink(hostPath)
}
