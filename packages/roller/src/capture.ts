import { createHash } from 'node:crypto'
import { relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { hasMultipleHardLinks } from './restore-files.js'
import {
  MAX_CHECKPOINT_BYTES,
  RETAINED_TURNS,
  type CheckpointKey,
  type CheckpointRecord,
} from './spec.js'

interface SessionLike {
  readonly header: { readonly id: string; readonly cwd?: string }
  snapshotEvents(): ReadonlyArray<{
    readonly type: string
    readonly data: unknown
  }>
}

interface MutationActor {
  readonly name: 'write' | 'edit' | 'str_replace_editor'
  readonly arguments: Record<string, unknown>
  readonly agent: { readonly session: SessionLike }
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mutationActor(value: object | undefined): MutationActor | undefined {
  if (!isRecord(value) || !isRecord(value.arguments) || !isRecord(value.agent)) return undefined
  const session = value.agent.session
  if (!isRecord(session) || !isRecord(session.header) || typeof session.snapshotEvents !== 'function') return undefined
  if (typeof session.header.id !== 'string') return undefined
  if (value.name !== 'write' && value.name !== 'edit' && value.name !== 'str_replace_editor') return undefined
  return value as unknown as MutationActor
}

function requestedPath(actor: MutationActor): string | undefined {
  if (actor.name === 'write' || actor.name === 'edit') {
    return typeof actor.arguments.file_path === 'string' ? actor.arguments.file_path : undefined
  }
  const command = actor.arguments.command
  if (command !== 'create' && command !== 'str_replace' && command !== 'insert') return undefined
  return typeof actor.arguments.path === 'string' ? actor.arguments.path : undefined
}

function openTurn(session: SessionLike): number | undefined {
  let boundary: { readonly type: string; readonly data: unknown } | undefined
  const events = session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.type === 'turn/start' || event.type === 'turn/end') {
      boundary = event
      break
    }
  }
  if (boundary?.type !== 'turn/start' || !isRecord(boundary.data)) return undefined
  return Number.isSafeInteger(boundary.data.turn) && (boundary.data.turn as number) >= 0
    ? boundary.data.turn as number
    : undefined
}

function keyOf(sessionId: string, turn: number, targetKey: string): CheckpointKey {
  return createHash('sha256')
    .update(sessionId).update('\0').update(String(turn)).update('\0').update(targetKey)
    .digest('hex') as CheckpointKey
}

function normalizedRelative(cwdPath: string, targetPath: string): string {
  return relative(cwdPath, targetPath).split(sep).join('/')
}

function losslessUtf8(bytes: Uint8Array): boolean {
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return false
  }
  return Buffer.from(decoded, 'utf8').equals(Buffer.from(bytes))
}

export class CaptureJournal {
  private readonly evictedAtTurn = new Map<string, number>()

  constructor(
    private readonly ctx: Context,
    private readonly checkpoints: KvTable<CheckpointKey, CheckpointRecord>,
  ) {}

  async capture(target: FsTarget, value: object | undefined): Promise<void> {
    const actor = mutationActor(value)
    if (actor === undefined) return
    const path = requestedPath(actor)
    const cwd = actor.agent.session.header.cwd
    const turn = openTurn(actor.agent.session)
    if (path === undefined || cwd === undefined || turn === undefined) return

    const sessionId = actor.agent.session.header.id
    const targetKey = String(target.targetKey)
    const key = keyOf(sessionId, turn, targetKey)
    const existing = this.checkpoints.get(key)
    if (existing !== undefined) {
      if (existing.sessionId !== sessionId || existing.turn !== turn || existing.targetKey !== targetKey) {
        throw new Error(`roller: checkpoint key collision for ${target.displayPath}`)
      }
      return
    }

    const cwdTarget = actor.signal === undefined
      ? await this.ctx.fs.resolve(cwd)
      : await this.ctx.fs.resolve(cwd, { signal: actor.signal })
    if (!this.ctx.fs.contains(cwdTarget, target)) return
    const pathInfo = await this.ctx.fs.lstat(path, { cwd }, actor.signal)
    if (pathInfo?.type === 'symlink') return

    let before: CheckpointRecord['before']
    if (pathInfo === undefined) {
      before = { kind: 'absent' }
    } else {
      if (pathInfo.type !== 'file') return
      if (await hasMultipleHardLinks(this.ctx.fs.processPath(target))) return
      let bytes: Uint8Array
      try {
        bytes = await this.ctx.fs.readBytes(target, actor.signal, MAX_CHECKPOINT_BYTES)
      } catch (error) {
        if (error instanceof FsError && error.code === 'FS_TOO_LARGE') return
        throw error
      }
      if (!losslessUtf8(bytes)) return
      before = {
        kind: 'text',
        contentBase64: Buffer.from(bytes).toString('base64'),
        byteLength: bytes.byteLength,
      }
    }

    await this.evict(sessionId, turn)
    const cwdPath = this.ctx.fs.processPath(cwdTarget)
    const targetPath = this.ctx.fs.processPath(target)
    try {
      await this.checkpoints.put(key, {
        sessionId,
        turn,
        targetKey,
        relativePath: normalizedRelative(cwdPath, targetPath),
        displayPath: target.displayPath,
        before,
      })
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error)
      throw new Error(`roller: checkpoint write failed for ${target.displayPath}: ${cause}`, { cause: error })
    }
  }

  private async evict(sessionId: string, turn: number): Promise<void> {
    if (this.evictedAtTurn.get(sessionId) === turn) return
    const cutoff = turn - (RETAINED_TURNS - 1)
    for (const [key, record] of this.checkpoints.entries()) {
      if (record.sessionId === sessionId && record.turn < cutoff) {
        await this.checkpoints.delete(key)
      }
    }
    // This is only a scan watermark. Journal correctness never depends on
    // retaining or reconstructing it, so a restart merely repeats one scan.
    this.evictedAtTurn.set(sessionId, turn)
  }
}
