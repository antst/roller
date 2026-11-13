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
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as AgentLoopTestkit from '@deepseek-ai/dsh-agent-loop-testkit'
import Commands from '@deepseek-ai/dsh-commands'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import SandboxedFileSystem from '@deepseek-ai/dsh-fs-sandbox'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { buildForkSeed, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import SandboxPolicy, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import Storage from '@deepseek-ai/dsh-storage'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as ToolStrReplaceEditor from '@deepseek-ai/dsh-tool-str-replace-editor'
import type {} from '@deepseek-ai/dsh-tools'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import * as Roller from '../src/index.js'
import type { CheckpointKey, CheckpointRecord } from '../src/index.js'
import { deleteRestoredFile } from '../src/restore-files.js'

const contexts: Context[] = []
const roots: string[] = []
let serial = 0

interface Harness {
  ctx: Context
  root: string
  session: ReturnType<Context['sessions']['create']>
  owner: Agent
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
  await AgentLoopTestkit.mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Commands)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: storageRoot })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: root })
  await ctx.plugin(options.sandboxed === true ? SandboxedFileSystem : LocalFileSystem, { cwd: root })
  await ctx.plugin(WorkingDirectory)
  const driver = await AgentLoopTestkit.mountAgentLoopTestHarness(ctx)
  await ctx.plugin(FsPolicy)
  await ctx.plugin(ToolFs, { applyPatch: true })
  await ctx.plugin(ToolStrReplaceEditor)
  await ctx.plugin(Roller)

  const owner = await driver.create(SessionId(`roller-restore-${++serial}`), {}, { cwd: root })
  const session = owner.session
  session.append('turn/start', { turn: 1 })
  const domain = ctx.storageDomain.get('roller')
  if (domain === undefined) throw new Error('roller domain did not open')
  const checkpoints = domain.table('checkpoints') as KvTable<CheckpointKey, CheckpointRecord>
  return { ctx, root, session, owner, checkpoints }
}

async function tool(h: Harness, name: string, arguments_: unknown): Promise<void> {
  const id = ToolCallId(`roller-restore-tool-${++serial}`)
  const batch = await h.ctx.tools.execute({
    signal: new AbortController().signal,
    calls: [{ type: 'tool-call', id, name, arguments: JSON.stringify(arguments_) }],
    agent: h.owner,
  })
  expect(batch.results).toHaveLength(1)
  expect(batch.results[0]?.callId).toBe(id)
  const result = batch.results[0]!.result
  expect(result.isError, result.error?.message).toBe(false)
}

async function command(h: Harness, seq: number | 'start', owner = h.owner, signal = new AbortController().signal) {
  const execution = await h.ctx.commands.execute(
    owner,
    `/roller-restore ${seq}`,
    [],
    signal,
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

  it('uses a historical parentSession seeded child header to restore from its parent journal', async () => {
    const h = await harness()
    const history = await buildThreeTurns(h)
    const { agent: owner } = await h.ctx.agents.create({
      sessionId: SessionId(`roller-child-${++serial}`),
      seed: buildForkSeed(h.session.snapshotEvents(), SessionSeq(history.end1)),
      inheritedEventCount: SessionLogOffset(history.end1 + 1),
      meta: { cwd: h.root, isSeeded: true, parentSession: h.session.id },
    })
    const fork = owner.session

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

  it('refuses inherited boundaries without a fork-source id, while own boundaries remain restorable', async () => {
    const h = await harness()
    const history = await buildThreeTurns(h)
    const { agent: child } = await h.ctx.agents.create({
      sessionId: SessionId(`roller-independent-fork-${++serial}`),
      seed: buildForkSeed(h.session.snapshotEvents(), SessionSeq(history.end1)),
      inheritedEventCount: SessionLogOffset(history.end1 + 1),
      meta: { cwd: h.root, isSeeded: true },
    })
    expect(child.session.header.parentSession).toBeUndefined()
    const untouched = await readFile(history.written, 'utf8')
    for (const boundary of [history.end1, 'start', 0] as const) {
      const result = await command(h, boundary, child)
      expect(result.kind).toBe('error')
      expect(result.text).toBe('Files from before this session was forked cannot be restored because DSH does not record the fork source.')
      expect(await readFile(history.written, 'utf8')).toBe(untouched)
    }
    child.session.append('turn/start', { turn: 2 })
    const ownBoundary = Number(child.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } }).seq)
    child.session.append('turn/start', { turn: 3 })
    const childHarness = { ...h, session: child.session, owner: child }
    await tool(childHarness, 'read', { file_path: history.written })
    await tool(childHarness, 'write', { file_path: history.written, content: 'child-owned mutation\n' })
    child.session.append('turn/end', { turn: 3, reason: { kind: 'completed' } })
    const restored = await command(h, ownBoundary, child)
    expect(restored.kind).toBe('success')
    expect(await readFile(history.written, 'utf8')).toBe(untouched)
  })

  it('delegates removal to the native filesystem with its complete extra-root policy', async () => {
    const h = await harness({ sandboxed: true })
    const other = await mkdtemp(join(tmpdir(), 'roller-policy-root-'))
    roots.push(other)
    const file = join(h.root, 'native-delete.txt')
    await writeFile(file, 'delete through native policy\n')
    const target = await h.ctx.fs.resolve(file)
    const policy = { ...h.ctx.sandboxPolicy.resolve({ session: h.session }),
      workspaceRoot: other, additionalWritableRoots: [h.root] }
    const signal = new AbortController().signal
    const nativeDelete = vi.spyOn(h.ctx.fs, 'deleteFile')
    await deleteRestoredFile(h.ctx, target, policy, true, signal)
    expect(nativeDelete).toHaveBeenCalledWith(target, undefined, signal, policy)
    await expectAbsent(file)
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
      `Failed (1):\n- sandbox-denied.txt: delete: cannot write "${created}": file access denied under read-only mode`,
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

  it('retains a successful restore prefix on cancellation and supports a later valid restore', async () => {
    const h = await harness()
    for (const file of ['a.txt', 'b.txt']) {
      await writeFile(join(h.root, file), 'before\n')
      await tool(h, 'read', { file_path: file })
      await tool(h, 'write', { file_path: file, content: 'after\n' })
    }
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const controller = new AbortController()
    const write = h.ctx.fs.writeText.bind(h.ctx.fs)
    const intercepted = vi.spyOn(h.ctx.fs, 'writeText').mockImplementation(async (...args) => {
      const result = await write(...args)
      controller.abort()
      return result
    })
    // The native command registry rejects on UI cancellation and records an
    // error, rather than returning the handler's eventual partial report.
    await expect(command(h, 'start', h.owner, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    intercepted.mockRestore()
    expect(h.session.snapshotEvents().at(-1)).toMatchObject({ type: 'command/done', data: { kind: 'error' } })
    expect(await readFile(join(h.root, 'a.txt'), 'utf8')).toBe('before\n')
    expect(await readFile(join(h.root, 'b.txt'), 'utf8')).toBe('after\n')
    expect((await command(h, 'start')).text).toContain('Failed (0):')
    expect(await readFile(join(h.root, 'b.txt'), 'utf8')).toBe('before\n')
  })

  it('reports malformed stored bytes without overwriting that path or suppressing other restores', async () => {
    const h = await harness()
    for (const file of ['bad.txt', 'good.txt']) {
      await writeFile(join(h.root, file), 'before\n')
      await tool(h, 'read', { file_path: file })
      await tool(h, 'write', { file_path: file, content: 'after\n' })
    }
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const bad = [...h.checkpoints.entries()].find(([, record]) => record.relativePath === 'bad.txt')!
    await h.checkpoints.put(bad[0], { ...bad[1], before: { kind: 'text', contentBase64: 'invalid-base64', byteLength: 1 } })
    const result = await command(h, 'start')
    expect(result.text).toContain('Written (1):\n- good.txt')
    expect(result.text).toContain('Failed (1):\n- bad.txt: write: checkpoint content is malformed')
    expect(await readFile(join(h.root, 'bad.txt'), 'utf8')).toBe('after\n')
    expect(await readFile(join(h.root, 'good.txt'), 'utf8')).toBe('before\n')
  })

  it('returns one-line errors for malformed and unknown boundaries', async () => {
    const h = await harness()
    const malformed = await h.ctx.commands.execute(
      h.owner, '/roller-restore nope', [], new AbortController().signal,
    )
    const unknown = await command(h, 999)

    expect(malformed?.result).toEqual({ kind: 'error', text: 'Usage: /roller-restore <turn-end-seq|start|0>' })
    expect(unknown).toEqual({ kind: 'error', text: 'No turn/end event exists at sequence 999.' })
  })
})
