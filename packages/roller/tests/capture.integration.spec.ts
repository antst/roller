import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import Commands from '@deepseek-ai/dsh-commands'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
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

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0).reverse()) await rm(root, { recursive: true, force: true })
})

async function harness(options: { fsPolicy?: boolean } = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'roller-'))
  const storageRoot = await mkdtemp(join(tmpdir(), 'roller-storage-'))
  roots.push(root, storageRoot)
  const ctx = new Context()
  contexts.push(ctx)

  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Commands)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: storageRoot })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: root })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  if (options.fsPolicy !== false) await ctx.plugin(FsPolicy)
  await ctx.plugin(ToolFs)
  await ctx.plugin(ToolStrReplaceEditor)
  await ctx.plugin(Roller)

  const session = ctx.sessions.create(SessionId(`roller-test-${++serial}`), { meta: { cwd: root } })
  session.append('turn/start', { turn: 1 })
  const domain = ctx.storageDomain.get('roller')
  if (domain === undefined) throw new Error('roller domain did not open')
  const checkpoints = domain.table('checkpoints') as KvTable<CheckpointKey, CheckpointRecord>
  return { ctx, root, session, owner: { session }, checkpoints }
}

async function call(h: Harness, name: string, arguments_: unknown) {
  return h.ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`roller-call-${++serial}`),
    name,
    arguments: arguments_,
    agent: h.owner as never,
  })
}

async function callSuccessfully(h: Harness, name: string, arguments_: unknown): Promise<void> {
  const result = await call(h, name, arguments_)
  expect(result.isError).toBe(false)
}

function recordsFor(h: Harness, sessionId = String(h.session.id)): CheckpointRecord[] {
  return [...h.checkpoints.entries()].map(([, record]) => record)
    .filter(record => record.sessionId === sessionId)
}

function decoded(record: CheckpointRecord): string | undefined {
  return record.before.kind === 'text'
    ? Buffer.from(record.before.contentBase64, 'base64').toString('utf8')
    : undefined
}

describe('roller capture journal with the published DSH host', () => {
  it('captures every covered real tool route once and keeps the first before-content', async () => {
    const h = await harness()
    const editPath = join(h.root, 'edit.txt')
    const replacePath = join(h.root, 'replace.txt')
    const insertPath = join(h.root, 'insert.txt')
    const viewedPath = join(h.root, 'viewed.txt')
    await writeFile(editPath, 'alpha beta gamma\n')
    await writeFile(replacePath, 'before needle after\n')
    await writeFile(insertPath, 'one\ntwo\n')
    await writeFile(viewedPath, 'read only\n')

    await callSuccessfully(h, 'write', { file_path: 'write-new.txt', content: 'written\n' })
    await callSuccessfully(h, 'read', { file_path: 'edit.txt' })
    await callSuccessfully(h, 'edit', {
      file_path: 'edit.txt', old_string: 'beta', new_string: 'BETA',
    })
    await callSuccessfully(h, 'edit', {
      file_path: editPath, old_string: 'gamma', new_string: 'GAMMA',
    })
    await callSuccessfully(h, 'str_replace_editor', {
      command: 'create', path: join(h.root, 'editor-new.txt'), file_text: 'created\n',
    })
    await callSuccessfully(h, 'str_replace_editor', { command: 'view', path: replacePath })
    await callSuccessfully(h, 'str_replace_editor', {
      command: 'str_replace', path: replacePath, old_str: 'needle', new_str: 'NEEDLE',
    })
    await callSuccessfully(h, 'str_replace_editor', { command: 'view', path: insertPath })
    await callSuccessfully(h, 'str_replace_editor', {
      command: 'insert', path: insertPath, insert_line: 1, new_str: 'between',
    })
    await callSuccessfully(h, 'str_replace_editor', { command: 'view', path: viewedPath })

    const records = recordsFor(h)
    expect(records).toHaveLength(5)
    expect(records.map(record => record.relativePath).sort()).toEqual([
      'edit.txt', 'editor-new.txt', 'insert.txt', 'replace.txt', 'write-new.txt',
    ])
    const byPath = new Map(records.map(record => [record.relativePath, record]))
    expect(byPath.get('write-new.txt')?.before).toEqual({ kind: 'absent' })
    expect(byPath.get('editor-new.txt')?.before).toEqual({ kind: 'absent' })
    expect(decoded(byPath.get('edit.txt')!)).toBe('alpha beta gamma\n')
    expect(decoded(byPath.get('replace.txt')!)).toBe('before needle after\n')
    expect(decoded(byPath.get('insert.txt')!)).toBe('one\ntwo\n')
    expect(await readFile(editPath, 'utf8')).toBe('alpha BETA GAMMA\n')
  })

  it('delegates to the observation policy after durable capture', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'unread.txt'), 'original')

    const result = await call(h, 'edit', {
      file_path: 'unread.txt', old_string: 'original', new_string: 'changed',
    })

    expect(result.isError).toBe(true)
    expect(result.error).toMatchObject({ info: { code: 'FS_NOT_OBSERVED' } })
    expect(await readFile(join(h.root, 'unread.txt'), 'utf8')).toBe('original')
    const records = recordsFor(h)
    expect(records).toHaveLength(1)
    expect(decoded(records[0]!)).toBe('original')
  })

  it('fails closed before mutation when checkpoint storage rejects', async () => {
    const h = await harness({ fsPolicy: false })
    const path = join(h.root, 'unchanged.txt')
    await writeFile(path, 'before storage failure')
    vi.spyOn(h.checkpoints, 'put').mockRejectedValueOnce(new Error('simulated medium failure'))
    let nextCalled = false
    h.ctx.on('fs/write-intent', async (_target, _actor, next) => {
      nextCalled = true
      return next()
    })

    const result = await call(h, 'write', { file_path: path, content: 'must not land' })

    expect(result.isError).toBe(true)
    expect(result.error?.message).toContain('roller: checkpoint write failed')
    expect(result.error?.message).toContain('simulated medium failure')
    expect(await readFile(path, 'utf8')).toBe('before storage failure')
    expect(nextCalled).toBe(false)
  })

  it('includes exactly 1 MiB and excludes larger before-content', async () => {
    const h = await harness()
    const atCap = 'a'.repeat(Roller.MAX_CHECKPOINT_BYTES)
    const overCap = 'b'.repeat(Roller.MAX_CHECKPOINT_BYTES + 1)
    await writeFile(join(h.root, 'at-cap.txt'), atCap)
    await writeFile(join(h.root, 'over-cap.txt'), overCap)

    await callSuccessfully(h, 'read', { file_path: 'at-cap.txt' })
    await callSuccessfully(h, 'write', { file_path: 'at-cap.txt', content: 'small' })
    await callSuccessfully(h, 'read', { file_path: 'over-cap.txt' })
    await callSuccessfully(h, 'write', { file_path: 'over-cap.txt', content: 'small' })

    const records = recordsFor(h)
    expect(records).toHaveLength(1)
    expect(records[0]?.relativePath).toBe('at-cap.txt')
    expect(records[0]?.before).toMatchObject({
      kind: 'text', byteLength: Roller.MAX_CHECKPOINT_BYTES,
    })
  })

  it('excludes unsafe, non-text, and out-of-workspace paths', async () => {
    const h = await harness()
    const outsideRoot = await mkdtemp(join(tmpdir(), 'roller-outside-'))
    roots.push(outsideRoot)
    await writeFile(join(h.root, 'plain.txt'), 'plain')
    await symlink('plain.txt', join(h.root, 'linked.txt'))
    await link(join(h.root, 'plain.txt'), join(h.root, 'hard.txt'))
    await mkdir(join(h.root, 'directory'))
    await writeFile(join(h.root, 'binary.dat'), new Uint8Array([0xff, 0xfe]))
    await writeFile(join(outsideRoot, 'outside.txt'), 'outside')

    for (const path of [
      'linked.txt', 'hard.txt', 'directory', 'binary.dat', join(outsideRoot, 'outside.txt'),
    ]) {
      const target = await h.ctx.fs.resolve(path, { cwd: h.root })
      await h.ctx.waterfall('fs/write-intent', target, {
        name: 'write',
        arguments: { file_path: path },
        agent: h.owner,
        signal: new AbortController().signal,
      }, () => undefined)
    }

    const ignoredTarget = await h.ctx.fs.resolve('ignored.txt', { cwd: h.root })
    await h.ctx.waterfall('fs/write-intent', ignoredTarget, {
      name: 'bash',
      arguments: { file_path: 'ignored.txt' },
      agent: h.owner,
    }, () => undefined)
    expect(recordsFor(h)).toHaveLength(0)

    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const closedTarget = await h.ctx.fs.resolve('closed.txt', { cwd: h.root })
    await h.ctx.waterfall('fs/write-intent', closedTarget, {
      name: 'write',
      arguments: { file_path: 'closed.txt' },
      agent: h.owner,
    }, () => undefined)
    expect(recordsFor(h)).toHaveLength(0)
  })

  it('evicts turn 1 at turn 101 and scans only on the first capture in each turn', async () => {
    const h = await harness()
    const tableEntries = vi.spyOn(h.checkpoints, 'entries')

    for (let turn = 1; turn <= 101; turn += 1) {
      if (turn > 1) h.session.append('turn/start', { turn })
      const path = `turn-${turn}.txt`
      const target = await h.ctx.fs.resolve(path, { cwd: h.root })
      const actor = {
        name: 'write',
        arguments: { file_path: path },
        agent: h.owner,
        signal: new AbortController().signal,
      }
      await h.ctx.waterfall('fs/write-intent', target, actor, () => undefined)

      if (turn === 101) {
        const secondPath = 'turn-101-second.txt'
        const secondTarget = await h.ctx.fs.resolve(secondPath, { cwd: h.root })
        await h.ctx.waterfall('fs/write-intent', secondTarget, {
          ...actor, arguments: { file_path: secondPath },
        }, () => undefined)
      }
      if (turn < 101) h.session.append('turn/end', { turn, reason: { kind: 'completed' } })
    }

    expect(tableEntries).toHaveBeenCalledTimes(101)
    tableEntries.mockRestore()
    const records = recordsFor(h)
    expect(records).toHaveLength(101)
    expect(records.some(record => record.turn === 1)).toBe(false)
    expect(records.filter(record => record.turn === 101)).toHaveLength(2)
    expect(new Set(records.map(record => record.turn))).toEqual(new Set(
      Array.from({ length: 100 }, (_, index) => index + 2),
    ))
  })
})
