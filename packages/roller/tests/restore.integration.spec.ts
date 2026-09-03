import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import Commands from '@deepseek-ai/dsh-commands'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import SandboxedFileSystem from '@deepseek-ai/dsh-fs-sandbox'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import Storage from '@deepseek-ai/dsh-storage'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as ToolStrReplaceEditor from '@deepseek-ai/dsh-tool-str-replace-editor'
import * as Roller from '../src/index.js'
import type { CheckpointKey, CheckpointRecord } from '../src/index.js'

const contexts: Context[] = []
const roots: string[] = []
let serial = 0

interface Harness {
  ctx: Context
  root: string
  session: ReturnType<Context['sessions']['create']>
  owner: { session: ReturnType<Context['sessions']['create']> }
  checkpoints: KvTable<CheckpointKey, CheckpointRecord>
}

interface History {
  end1: number
  end3: number
  written: string
  edited: string
  kept: string
  created2: string
  created3: string
  untouched: string
}

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0).reverse()) await rm(root, { recursive: true, force: true })
})

async function harness(options: { sandboxed?: boolean } = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'roller-restore-'))
  const storageRoot = await mkdtemp(join(tmpdir(), 'roller-restore-storage-'))
  roots.push(root, storageRoot)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionProjectionRegistry)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Commands)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: storageRoot })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: root })
  await ctx.plugin(options.sandboxed === true ? SandboxedFileSystem : LocalFileSystem, { cwd: root })
  await ctx.plugin(FsPolicy)
  await ctx.plugin(ToolFs)
  await ctx.plugin(ToolStrReplaceEditor)
  await ctx.plugin(Roller)

  const session = ctx.sessions.create(SessionId(`roller-restore-${++serial}`), { meta: { cwd: root } })
  session.append('turn/start', { turn: 1 })
  const domain = ctx.storageDomain.get('roller')
  if (domain === undefined) throw new Error('roller domain did not open')
  const checkpoints = domain.table('checkpoints') as KvTable<CheckpointKey, CheckpointRecord>
  return { ctx, root, session, owner: { session }, checkpoints }
}

async function tool(h: Harness, name: string, arguments_: unknown): Promise<void> {
  const result = await h.ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`roller-restore-tool-${++serial}`),
    name,
    arguments: arguments_,
    agent: h.owner as never,
  })
  expect(result.isError, result.error?.message).toBe(false)
}

async function command(h: Harness, seq: number | 'start', owner = h.owner) {
  const execution = await h.ctx.commands.execute(
    owner as never,
    `/roller-restore ${seq}`,
    [],
    new AbortController().signal,
  )
  if (execution === undefined) throw new Error('roller-restore command did not resolve')
  return execution.result
}

async function buildThreeTurns(h: Harness): Promise<History> {
  const written = join(h.root, 'written.txt')
  const locked = join(h.root, 'locked')
  const edited = join(locked, 'edited.txt')
  const kept = join(h.root, 'kept-from-turn-1.txt')
  const created2 = join(h.root, 'created-turn-2.txt')
  const created3 = join(h.root, 'created-turn-3.txt')
  const untouched = join(h.root, 'untouched.txt')
  await mkdir(locked)
  await writeFile(written, 'before turns\n')
  await writeFile(edited, 'edit zero\n')
  await writeFile(untouched, 'never touched\n')

  await tool(h, 'read', { file_path: written })
  await tool(h, 'write', { file_path: written, content: 'turn one\n' })
  await tool(h, 'read', { file_path: edited })
  await tool(h, 'edit', { file_path: edited, old_string: 'zero', new_string: 'one' })
  await tool(h, 'str_replace_editor', { command: 'create', path: kept, file_text: 'keep me\n' })
  const end1 = Number(h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }).seq)

  h.session.append('turn/start', { turn: 2 })
  await tool(h, 'write', { file_path: written, content: 'turn two\n' })
  await tool(h, 'edit', { file_path: edited, old_string: 'one', new_string: 'two' })
  await tool(h, 'str_replace_editor', { command: 'create', path: created2, file_text: 'later two\n' })
  h.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })

  h.session.append('turn/start', { turn: 3 })
  await tool(h, 'write', { file_path: written, content: 'turn three\n' })
  await tool(h, 'edit', { file_path: edited, old_string: 'two', new_string: 'three' })
  await tool(h, 'str_replace_editor', { command: 'create', path: created3, file_text: 'later three\n' })
  const end3 = Number(h.session.append('turn/end', { turn: 3, reason: { kind: 'completed' } }).seq)
  return { end1, end3, written, edited, kept, created2, created3, untouched }
}

async function expectAbsent(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
}

describe('/roller-restore', () => {
  it('restores every real-tool turn to session start through start and 0', async () => {
    async function restore(target: 'start' | 0) {
      const h = await harness()
      const history = await buildThreeTurns(h)
      return { h, history, result: await command(h, target) }
    }
    const named = await restore('start')
    const alias = await restore(0)

    expect(alias.result).toEqual(named.result)
    expect(named.result).toEqual({
      kind: 'success',
      text: [
        'Restored files to session start.',
        'Written (2):', '- locked/edited.txt', '- written.txt',
        'Deleted (3):', '- created-turn-2.txt', '- created-turn-3.txt', '- kept-from-turn-1.txt',
        'Failed (0):', '- none',
      ].join('\n'),
    })
    for (const { h, history } of [named, alias]) {
      expect(await readFile(history.written, 'utf8')).toBe('before turns\n')
      expect(await readFile(history.edited, 'utf8')).toBe('edit zero\n')
      expect(await readFile(history.untouched, 'utf8')).toBe('never touched\n')
      await expectAbsent(history.kept)
      await expectAbsent(history.created2)
      await expectAbsent(history.created3)
      expect(h.session.snapshotEvents().at(-1)?.type).toBe('command/done')
    }
  })

  it('restores three real-tool turns and records the exact command/done report', async () => {
    const h = await harness()
    const history = await buildThreeTurns(h)
    const lstat = vi.spyOn(h.ctx.fs, 'lstat')

    const result = await command(h, history.end1)

    expect(result.kind).toBe('success')
    const expected = [
      `Restored files to turn/end ${history.end1} (turn 1).`,
      'Written (2):', '- locked/edited.txt', '- written.txt',
      'Deleted (2):', '- created-turn-2.txt', '- created-turn-3.txt',
      'Failed (0):', '- none',
    ].join('\n')
    expect(result.text).toBe(expected)
    expect(lstat).toHaveBeenCalledTimes(4)
    expect(await readFile(history.written, 'utf8')).toBe('turn one\n')
    expect(await readFile(history.edited, 'utf8')).toBe('edit one\n')
    expect(await readFile(history.kept, 'utf8')).toBe('keep me\n')
    expect(await readFile(history.untouched, 'utf8')).toBe('never touched\n')
    await expectAbsent(history.created2)
    await expectAbsent(history.created3)
    const done = h.session.snapshotEvents().at(-1)
    expect(done?.type).toBe('command/done')
    expect(done?.type === 'command/done' ? done.data.text : undefined).toBe(expected)

    const nothing = await command(h, history.end3)
    expect(nothing).toEqual({
      kind: 'success',
      text: [
        `Restored files to turn/end ${history.end3} (turn 3).`,
        'Written (0):', '- none', 'Deleted (0):', '- none', 'Failed (0):', '- none',
      ].join('\n'),
    })
  })

  it('continues after one unwritable path and does not roll back successes', async () => {
    const h = await harness()
    const history = await buildThreeTurns(h)
    const locked = join(h.root, 'locked')
    await chmod(locked, 0o555)

    let result: Awaited<ReturnType<typeof command>>
    try {
      result = await command(h, history.end1)
    } finally {
      await chmod(locked, 0o755)
    }

    expect(result.kind).toBe('success')
    expect(result.text).toContain('Written (1):\n- written.txt')
    expect(result.text).toContain('Deleted (2):\n- created-turn-2.txt\n- created-turn-3.txt')
    expect(result.text).toContain('Failed (1):\n- locked/edited.txt: write:')
    expect(await readFile(history.written, 'utf8')).toBe('turn one\n')
    expect(await readFile(history.edited, 'utf8')).toBe('edit three\n')
    await expectAbsent(history.created2)
    await expectAbsent(history.created3)
  })

  it('uses a seeded child header to restore from its parent journal', async () => {
    const h = await harness()
    const history = await buildThreeTurns(h)
    const fork = h.ctx.sessions.fork(
      h.session,
      SessionSeq(history.end1),
      SessionId(`roller-child-${++serial}`),
    )
    const owner = { session: fork }

    const result = await command(h, history.end1, owner)

    expect(fork.header.parentSession).toBe(h.session.id)
    expect(result.kind).toBe('success')
    expect(await readFile(history.written, 'utf8')).toBe('turn one\n')
    expect(await readFile(history.edited, 'utf8')).toBe('edit one\n')
    await expectAbsent(history.created2)
    await expectAbsent(history.created3)
    expect(fork.snapshotEvents().at(-1)?.type).toBe('command/done')
    expect(h.session.snapshotEvents().at(-1)?.type).toBe('turn/end')
  })

  it('reports a read-only deletion denial without unlinking the host file', async () => {
    const h = await harness({ sandboxed: true })
    const end1 = Number(h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }).seq)
    h.session.append('turn/start', { turn: 2 })
    const created = join(h.root, 'sandbox-denied.txt')
    await tool(h, 'str_replace_editor', { command: 'create', path: created, file_text: 'stay\n' })
    h.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    setSandboxMode(h.session, 'read-only')

    const result = await command(h, end1)

    expect(result.kind).toBe('success')
    expect(result.text).toContain('Deleted (0):\n- none')
    expect(result.text).toContain(
      'Failed (1):\n- sandbox-denied.txt: delete: cannot delete',
    )
    expect(result.text).toContain('read-only mode')
    expect(await readFile(created, 'utf8')).toBe('stay\n')
  })

  it('refuses symlinks on both the write and delete restore branches', async () => {
    const h = await harness()
    const writePath = join(h.root, 'write-link.txt')
    const deletePath = join(h.root, 'delete-link.txt')
    const writeTarget = join(h.root, 'write-target.txt')
    const deleteTarget = join(h.root, 'delete-target.txt')
    await writeFile(writePath, 'before\n')
    await writeFile(writeTarget, 'write target\n')
    await writeFile(deleteTarget, 'delete target\n')
    const end1 = Number(h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }).seq)

    h.session.append('turn/start', { turn: 2 })
    await tool(h, 'read', { file_path: writePath })
    await tool(h, 'write', { file_path: writePath, content: 'after\n' })
    await tool(h, 'write', { file_path: deletePath, content: 'created\n' })
    h.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    await unlink(writePath)
    await unlink(deletePath)
    await symlink(writeTarget, writePath)
    await symlink(deleteTarget, deletePath)

    // The common guard rejects a symlink before either branch dispatches
    // (packages/roller/src/restore.ts:97-106).
    const result = await command(h, end1)

    expect(result.kind).toBe('success')
    expect(result.text).toContain('Written (0):\n- none')
    expect(result.text).toContain('Deleted (0):\n- none')
    expect(result.text).toContain([
      'Failed (2):',
      '- delete-link.txt: delete: refusing to restore a symbolic link',
      '- write-link.txt: write: refusing to restore a symbolic link',
    ].join('\n'))
    expect((await lstat(writePath)).isSymbolicLink()).toBe(true)
    expect((await lstat(deletePath)).isSymbolicLink()).toBe(true)
    expect(await readlink(writePath)).toBe(writeTarget)
    expect(await readlink(deletePath)).toBe(deleteTarget)
    expect(await readFile(writeTarget, 'utf8')).toBe('write target\n')
    expect(await readFile(deleteTarget, 'utf8')).toBe('delete target\n')
  })

  it('counts an already-absent absence-marked path as a successful deletion', async () => {
    const h = await harness()
    const created = join(h.root, 'already-absent.txt')
    const end1 = Number(h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }).seq)
    h.session.append('turn/start', { turn: 2 })
    await tool(h, 'write', { file_path: created, content: 'temporary\n' })
    h.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    await unlink(created)

    // The delete seam accepts !exists, and the restore loop records it as deleted
    // (packages/roller/src/restore-files.ts:19; packages/roller/src/restore.ts:105-107).
    const result = await command(h, end1)

    expect(result).toEqual({
      kind: 'success',
      text: [
        `Restored files to turn/end ${end1} (turn 1).`,
        'Written (0):', '- none',
        'Deleted (1):', '- already-absent.txt',
        'Failed (0):', '- none',
      ].join('\n'),
    })
    await expectAbsent(created)
  })

  it('returns one-line errors for malformed and unknown boundaries', async () => {
    const h = await harness()
    const malformed = await h.ctx.commands.execute(
      h.owner as never, '/roller-restore nope', [], new AbortController().signal,
    )
    const unknown = await command(h, 999)

    expect(malformed?.result).toEqual({ kind: 'error', text: 'Usage: /roller-restore <turn-end-seq|start|0>' })
    expect(unknown).toEqual({ kind: 'error', text: 'No turn/end event exists at sequence 999.' })
  })
})
