import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { deleteRestoredFile } from './restore-files.js'
import { formatRestoreReport } from './format.js'
import type { RestoreFailure } from './format.js'
import type { CheckpointKey, CheckpointRecord } from './spec.js'

function parseSeq(rawInput: string): number | undefined {
  const value = rawInput.trim()
  if (!/^\d+$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function latestCompletedTurn(session: Session): number {
  const events = session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.type === 'turn/end') return event.data.turn
  }
  return 0
}

function selectedRecords(
  checkpoints: KvTable<CheckpointKey, CheckpointRecord>,
  sessionId: string,
  targetTurn: number,
): CheckpointRecord[] {
  const newestFirst = [...checkpoints.entries()]
    .map(([, record]) => record)
    .filter(record => record.sessionId === sessionId && record.turn > targetTurn)
    .sort((left, right) => right.turn - left.turn)
  const selected = new Map<string, CheckpointRecord>()
  for (const record of newestFirst) selected.set(record.targetKey, record)
  return [...selected.values()].sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0)
}

function decodedContent(record: CheckpointRecord): string {
  if (record.before.kind !== 'text') throw new Error('checkpoint does not contain text')
  const bytes = Buffer.from(record.before.contentBase64, 'base64')
  if (bytes.toString('base64') !== record.before.contentBase64
    || bytes.byteLength !== record.before.byteLength) {
    throw new Error('checkpoint content is malformed')
  }
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error('checkpoint content is not lossless UTF-8')
  return content
}

function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replaceAll(/\s+/gu, ' ').trim() || 'unknown failure'
}

function error(text: string): CommandResult {
  return { kind: 'error', text }
}

export async function restoreCommand(
  ctx: Context,
  checkpoints: KvTable<CheckpointKey, CheckpointRecord>,
  invocation: CommandInvocation,
): Promise<CommandResult> {
  const value = invocation.rawInput.trim()
  const start = value === 'start' || value === '0'
  const seq = start ? 0 : parseSeq(value)
  if (seq === undefined) return error('Usage: /roller-restore <turn-end-seq|start|0>')

  const current = invocation.agent.session
  const sourceId = current.header.parentSession ?? current.id
  const source = ctx.sessions.get(sourceId)
  if (source === undefined) return error(`Source session ${sourceId} is not live.`)
  const boundary = start
    ? { type: 'turn/end', data: { turn: -1 } } as const
    : source.eventAt(SessionSeq(seq))
  if (boundary?.type !== 'turn/end') return error(`No turn/end event exists at sequence ${seq}.`)

  const latestTurn = latestCompletedTurn(source)
  if (!start && latestTurn - boundary.data.turn > 100) {
    return error(`Turn ${boundary.data.turn} is outside roller's 100-turn retention window.`)
  }
  const cwd = current.header.cwd
  if (cwd === undefined) return error('The current session has no workspace cwd.')
  const records = selectedRecords(checkpoints, String(sourceId), boundary.data.turn)
  const policy = ctx.sandboxPolicy.resolve({ session: current })
  const written: string[] = []
  const deleted: string[] = []
  const failed: RestoreFailure[] = []
  const cwdTarget = await ctx.fs.resolve(cwd, { signal: invocation.signal })

  for (const record of records) {
    const operation = record.before.kind === 'text' ? 'write' : 'delete'
    try {
      const target = await ctx.fs.resolve(record.relativePath, { cwd, signal: invocation.signal })
      if (!ctx.fs.contains(cwdTarget, target)) throw new Error('path is outside the session cwd')
      const pathInfo = await ctx.fs.lstat(record.relativePath, { cwd }, invocation.signal)
      if (pathInfo?.type === 'symlink') throw new Error('refusing to restore a symbolic link')
      if (pathInfo !== undefined && pathInfo.type !== 'file') throw new Error('path is not a regular file')
      if (record.before.kind === 'text') {
        await ctx.fs.writeText(
          target, decodedContent(record), undefined, invocation.signal, policy,
        )
        written.push(record.relativePath)
      } else {
        await deleteRestoredFile(ctx, target, policy, pathInfo !== undefined, invocation.signal)
        deleted.push(record.relativePath)
      }
    } catch (pathError) {
      failed.push({
        path: record.relativePath,
        operation,
        message: failureMessage(pathError),
      })
    }
  }
  return {
    kind: 'success',
    text: formatRestoreReport({ seq, turn: start ? 0 : boundary.data.turn, written, deleted, failed }),
  }
}

export function registerRestoreCommand(
  ctx: Context,
  checkpoints: KvTable<CheckpointKey, CheckpointRecord>,
): () => void {
  return ctx.commands.register({
    name: 'roller-restore',
    description: 'Restore files to a completed turn boundary or session start',
    input: { hint: '<turn-end-seq|start|0>' },
    handler: invocation => restoreCommand(ctx, checkpoints, invocation),
  })
}
