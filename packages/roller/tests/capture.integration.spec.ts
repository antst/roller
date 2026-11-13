import { chmod, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as AgentLoopTestkit from '@deepseek-ai/dsh-agent-loop-testkit'
import Commands from '@deepseek-ai/dsh-commands'
import { FsError } from '@deepseek-ai/dsh-fs'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import Storage, { StorageError } from '@deepseek-ai/dsh-storage'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as ToolStrReplaceEditor from '@deepseek-ai/dsh-tool-str-replace-editor'
import type {} from '@deepseek-ai/dsh-tools'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import * as Roller from '../src/index.js'
import type { CheckpointKey, CheckpointRecord } from '../src/index.js'

const contexts: Context[] = []
const roots: string[] = []
let serial = 0

interface Harness {
  ctx: Context
  root: string
  storageRoot: string
  session: ReturnType<Context['sessions']['create']>
  owner: Agent
  roller: Fiber
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

  await AgentLoopTestkit.mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Commands)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: storageRoot })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: root })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(WorkingDirectory)
  const driver = await AgentLoopTestkit.mountAgentLoopTestHarness(ctx)
  if (options.fsPolicy !== false) await ctx.plugin(FsPolicy)
  await ctx.plugin(ToolFs, { applyPatch: true })
  await ctx.plugin(ToolStrReplaceEditor)
  const roller = ctx.plugin(Roller)
  await roller

  const owner = await driver.create(SessionId(`roller-test-${++serial}`), {}, { cwd: root })
  const session = owner.session
  session.append('turn/start', { turn: 1 })
  const domain = ctx.storageDomain.get('roller')
  if (domain === undefined) throw new Error('roller domain did not open')
  const checkpoints = domain.table('checkpoints') as KvTable<CheckpointKey, CheckpointRecord>
  return { ctx, root, storageRoot, session, owner, roller, checkpoints }
}

async function call(h: Harness, name: string, arguments_: unknown, signal = new AbortController().signal) {
  const id = ToolCallId(`roller-call-${++serial}`)
  const batch = await h.ctx.tools.execute({
    signal,
    calls: [{ type: 'tool-call', id, name, arguments: JSON.stringify(arguments_) }],
    agent: h.owner,
  })
  expect(batch.results).toHaveLength(1)
  expect(batch.results[0]?.callId).toBe(id)
  return batch.results[0]!.result
}

async function callSuccessfully(h: Harness, name: string, arguments_: unknown): Promise<void> {
  const result = await call(h, name, arguments_)
  expect(result.isError, result.error?.message).toBe(false)
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

  it('captures native patch add/update/delete/move endpoints once and restores their original bytes', async () => {
    const h = await harness()
    for (const [file, text] of [['update.txt', 'old\n'], ['delete.txt', 'remove\n'], ['source.txt', 'source\n'], ['destination.txt', 'destination\n']]) {
      await writeFile(join(h.root, file!), text!)
      await callSuccessfully(h, 'read', { file_path: file })
    }
    await callSuccessfully(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Add File: added.txt', '+added',
      '*** Update File: update.txt', '@@', '-old', '+middle',
      '*** Update File: ./update.txt', '@@', '-middle', '+new',
      '*** Delete File: delete.txt',
      '*** Update File: source.txt', '*** Move to: destination.txt', '@@', '-source', '+moved',
      '*** End Patch',
    ].join('\n') })
    const records = recordsFor(h), byPath = new Map(records.map(record => [record.relativePath, record]))
    expect(records).toHaveLength(5)
    expect(byPath.get('added.txt')?.before).toEqual({ kind: 'absent' })
    expect(decoded(byPath.get('update.txt')!)).toBe('old\n')
    expect(decoded(byPath.get('delete.txt')!)).toBe('remove\n')
    expect(decoded(byPath.get('source.txt')!)).toBe('source\n')
    expect(decoded(byPath.get('destination.txt')!)).toBe('destination\n')
    expect(await readFile(join(h.root, 'update.txt'), 'utf8')).toBe('new\n')
    expect(await readFile(join(h.root, 'destination.txt'), 'utf8')).toBe('moved\n')
    await expect(readFile(join(h.root, 'source.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(h.root, 'delete.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const restored = await h.ctx.commands.execute(h.owner, '/roller-restore start', [], new AbortController().signal)
    expect(restored?.result.kind).toBe('success')
    for (const [file, text] of [['update.txt', 'old\n'], ['delete.txt', 'remove\n'], ['source.txt', 'source\n'], ['destination.txt', 'destination\n']]) {
      expect(await readFile(join(h.root, file!), 'utf8')).toBe(text)
    }
    await expect(readFile(join(h.root, 'added.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(restored?.result.text).toContain('Failed (0):')
  })

  it('checkpoints a mixed-alias patch through its ordinary path but excludes a symlink-only patch', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'plain.txt'), 'before\n')
    await symlink('plain.txt', join(h.root, 'alias.txt'))
    await callSuccessfully(h, 'read', { file_path: 'alias.txt' })
    await callSuccessfully(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Update File: alias.txt', '@@', '-before', '+middle',
      '*** Update File: plain.txt', '@@', '-middle', '+after', '*** End Patch',
    ].join('\n') })
    expect(recordsFor(h)).toHaveLength(1)
    expect(recordsFor(h)[0]?.relativePath).toBe('plain.txt')
    expect(decoded(recordsFor(h)[0]!)).toBe('before\n')
    expect(await readFile(join(h.root, 'plain.txt'), 'utf8')).toBe('after\n')
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    h.session.append('turn/start', { turn: 2 })
    await callSuccessfully(h, 'read', { file_path: 'alias.txt' })
    await callSuccessfully(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Update File: alias.txt', '@@', '-after', '+excluded', '*** End Patch',
    ].join('\n') })
    expect(recordsFor(h).filter(record => record.turn === 2)).toHaveLength(0)
    expect(await readFile(join(h.root, 'plain.txt'), 'utf8')).toBe('excluded\n')
  })

  it('captures a move source independently when its destination is a final symlink', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'source.txt'), 'source\n')
    await writeFile(join(h.root, 'target.txt'), 'target\n')
    await symlink('target.txt', join(h.root, 'destination.txt'))
    for (const file of ['source.txt', 'destination.txt']) await callSuccessfully(h, 'read', { file_path: file })
    await callSuccessfully(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Update File: source.txt', '*** Move to: destination.txt',
      '@@', '-source', '+moved', '*** End Patch',
    ].join('\n') })
    expect(recordsFor(h).map(record => record.relativePath)).toEqual(['source.txt'])
    expect(decoded(recordsFor(h)[0]!)).toBe('source\n')
    expect(await readFile(join(h.root, 'target.txt'), 'utf8')).toBe('moved\n')
    await expect(readFile(join(h.root, 'source.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('resolves arguments in the changed working directory without widening header-cwd coverage', async () => {
    // Isolate roller delegation: the observation-policy waterfall intentionally
    // terminates with an intent instead of invoking its terminal callback.
    const h = await harness({ fsPolicy: false })
    const sub = join(h.root, 'sub'), outside = await mkdtemp(join(tmpdir(), 'roller-current-directory-'))
    roots.push(outside)
    await mkdir(sub)
    await h.ctx.workingDirectory.set(h.owner, sub)
    await callSuccessfully(h, 'write', { file_path: 'relative.txt', content: 'inside\n' })
    expect(recordsFor(h).map(record => record.relativePath)).toEqual(['sub/relative.txt'])
    expect(await readFile(join(sub, 'relative.txt'), 'utf8')).toBe('inside\n')
    await h.ctx.workingDirectory.set(h.owner, outside)
    let delegated = false
    const target = await h.ctx.fs.resolve('outside.txt', { cwd: outside })
    await h.ctx.waterfall('fs/write-intent', target, {
      name: 'write', arguments: { file_path: 'outside.txt' }, agent: h.owner,
      signal: new AbortController().signal,
    }, () => { delegated = true })
    expect(delegated).toBe(true)
    expect(recordsFor(h).map(record => record.relativePath)).toEqual(['sub/relative.txt'])
  })

  it('preserves physical symlink/.. traversal when matching patch paths to opaque targets', async () => {
    const h = await harness()
    await mkdir(join(h.root, 'branch', 'deep'), { recursive: true })
    await writeFile(join(h.root, 'branch', 'plain.txt'), 'physical\n')
    await writeFile(join(h.root, 'plain.txt'), 'lexical path must stay untouched\n')
    await symlink('branch/deep', join(h.root, 'jump'))
    await callSuccessfully(h, 'read', { file_path: 'jump/../plain.txt' })
    await callSuccessfully(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Update File: jump/../plain.txt', '@@', '-physical', '+changed', '*** End Patch',
    ].join('\n') })
    expect(recordsFor(h).map(record => record.relativePath)).toEqual(['branch/plain.txt'])
    expect(decoded(recordsFor(h)[0]!)).toBe('physical\n')
    expect(await readFile(join(h.root, 'branch', 'plain.txt'), 'utf8')).toBe('changed\n')
    expect(await readFile(join(h.root, 'plain.txt'), 'utf8')).toBe('lexical path must stay untouched\n')
  })

  it('does not mutate any file on failed patch preflight or checkpoint failure', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'original.txt'), 'original\n')
    await callSuccessfully(h, 'read', { file_path: 'original.txt' })
    const invalid = await call(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Add File: should-not-exist.txt', '+new',
      '*** Update File: original.txt', '@@', '-not present', '+invalid', '*** End Patch',
    ].join('\n') })
    expect(JSON.stringify(invalid)).toMatch(/mismatch|match|refus|fail/iu)
    expect(await readFile(join(h.root, 'original.txt'), 'utf8')).toBe('original\n')
    await expect(readFile(join(h.root, 'should-not-exist.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    vi.spyOn(h.checkpoints, 'put').mockRejectedValueOnce(new Error('patch checkpoint failure'))
    const refused = await call(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Add File: blocked.txt', '+blocked', '*** End Patch',
    ].join('\n') })
    expect(JSON.stringify(refused)).toContain('patch checkpoint failure')
    await expect(readFile(join(h.root, 'blocked.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves the single native problem when an unrelated patch spelling cannot resolve', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'notdir.txt'), 'not a directory\n')
    await writeFile(join(h.root, 'plain.txt'), 'before\n')
    await callSuccessfully(h, 'read', { file_path: 'plain.txt' })
    const patch = { input: [
      '*** Begin Patch', '*** Update File: notdir.txt/child.txt', '@@', '-before', '+after',
      '*** Update File: plain.txt', '@@', '-before', '+after', '*** End Patch',
    ].join('\n') }
    const mounted = await call(h, 'apply_patch', patch)
    expect(await readFile(join(h.root, 'plain.txt'), 'utf8')).toBe('before\n')
    await h.roller.dispose()
    const native = await call(h, 'apply_patch', patch)
    expect(JSON.stringify(native.content)).toContain('1 problem')
    expect(mounted.isError).toBe(native.isError)
    expect(mounted.error).toEqual(native.error)
    expect(mounted.value).toEqual(native.value)
    expect(mounted.content).toEqual(native.content)
  })

  it('preserves a native symlink edit before a later patch path becomes unresolvable', async () => {
    const patch = { input: [
      '*** Begin Patch', '*** Add File: foo', '+file',
      '*** Update File: link', '@@', '-before', '+after',
      '*** Add File: foo/x', '+child', '*** End Patch',
    ].join('\n') }
    async function execute(mounted: boolean) {
      const h = await harness()
      if (!mounted) await h.roller.dispose()
      await writeFile(join(h.root, 'real.txt'), 'before\n')
      await symlink('real.txt', join(h.root, 'link'))
      await callSuccessfully(h, 'read', { file_path: 'link' })
      const result = await call(h, 'apply_patch', patch)
      expect(result.value).toMatchObject({ phase: 'commit', operations: [
        { status: 'completed' }, { status: 'completed' }, { status: 'failed' },
      ] })
      expect(await readFile(join(h.root, 'real.txt'), 'utf8')).toBe('after\n')
      if (mounted) expect(recordsFor(h).some(record => record.relativePath === 'real.txt')).toBe(false)
      return JSON.stringify({ value: result.value, content: result.content }).replaceAll(h.root, '<workspace>')
    }
    expect(await execute(true)).toBe(await execute(false))
  })

  it('propagates structured, plain and DOM aborts from a spelling probe without delegating', async () => {
    const h = await harness({ fsPolicy: false })
    const target = await h.ctx.fs.resolve('abort.txt', { cwd: h.root })
    const resolve = h.ctx.fs.resolve.bind(h.ctx.fs)
    for (const abort of [new FsError('resolve aborted', 'FS_ABORTED'),
      Object.assign(new Error('plain abort'), { name: 'AbortError' }), new DOMException('DOM abort', 'AbortError')]) {
      const probe = vi.spyOn(h.ctx.fs, 'resolve').mockImplementation(async (...args) => {
        if (args[0] === 'abort.txt') throw abort
        return resolve(...args)
      })
      let delegated = false
      try {
        await expect(h.ctx.waterfall('fs/write-intent', target, {
          name: 'write', arguments: { file_path: 'abort.txt' }, agent: h.owner,
        }, () => { delegated = true })).rejects.toBe(abort)
        expect(delegated).toBe(false)
        expect(recordsFor(h)).toHaveLength(0)
      } finally { probe.mockRestore() }
    }
  })

  it('restores both checkpoints after a move publishes its destination but cannot remove its source', async () => {
    const h = await harness()
    const locked = join(h.root, 'locked')
    await mkdir(locked)
    await writeFile(join(locked, 'source.txt'), 'source\n')
    await writeFile(join(h.root, 'destination.txt'), 'destination\n')
    for (const file of ['locked/source.txt', 'destination.txt']) await callSuccessfully(h, 'read', { file_path: file })
    await chmod(locked, 0o555)
    try {
      const result = await call(h, 'apply_patch', { input: [
        '*** Begin Patch', '*** Update File: locked/source.txt', '*** Move to: destination.txt',
        '@@', '-source', '+moved', '*** End Patch',
      ].join('\n') })
      // The native patch result carries partial failure in value.operations.
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({ phase: 'commit', operations: [{ status: 'failed', changes: [{ after: 'moved\n' }] }] })
      expect(await readFile(join(locked, 'source.txt'), 'utf8')).toBe('source\n')
      expect(await readFile(join(h.root, 'destination.txt'), 'utf8')).toBe('moved\n')
      expect(recordsFor(h)).toHaveLength(2)
    } finally {
      await chmod(locked, 0o755)
    }
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const restored = await h.ctx.commands.execute(h.owner, '/roller-restore start', [], new AbortController().signal)
    expect(restored?.result.text).toContain('Failed (0):')
    expect(await readFile(join(locked, 'source.txt'), 'utf8')).toBe('source\n')
    expect(await readFile(join(h.root, 'destination.txt'), 'utf8')).toBe('destination\n')
  })

  it('retains a completed patch prefix on cancellation and allows a later valid mutation and restore', async () => {
    const h = await harness()
    const controller = new AbortController()
    const write = h.ctx.fs.writeText.bind(h.ctx.fs)
    const intercepted = vi.spyOn(h.ctx.fs, 'writeText').mockImplementation(async (...args) => {
      const outcome = await write(...args)
      controller.abort()
      return outcome
    })
    const result = await call(h, 'apply_patch', { input: [
      '*** Begin Patch', '*** Add File: first.txt', '+first',
      '*** Add File: second.txt', '+second', '*** End Patch',
    ].join('\n') }, controller.signal)
    intercepted.mockRestore()
    // The native batch executor replaces a cancelled tool value with ABORTED.
    // Underlying bytes and the first-touch journal, not that value, prove effects.
    expect(result).toMatchObject({ isError: true, error: { info: { code: 'ABORTED' } } })
    expect(recordsFor(h).map(record => record.relativePath).sort()).toEqual(['first.txt', 'second.txt'])
    expect(await readFile(join(h.root, 'first.txt'), 'utf8')).toBe('first\n')
    await expect(readFile(join(h.root, 'second.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await callSuccessfully(h, 'write', { file_path: 'later.txt', content: 'later\n' })
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const restored = await h.ctx.commands.execute(h.owner, '/roller-restore start', [], new AbortController().signal)
    expect(restored?.result.text).toContain('Failed (0):')
    for (const file of ['first.txt', 'second.txt', 'later.txt']) {
      await expect(readFile(join(h.root, file))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('closes a domain whose open resolves after the consumer fiber is disposed', async () => {
    const h = await harness({ fsPolicy: false })
    await h.roller.dispose()
    let entered!: () => void, release!: () => void
    const opening = new Promise<void>(resolve => { entered = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    const open = h.ctx.storageDomain.open.bind(h.ctx.storageDomain)
    const intercepted = vi.spyOn(h.ctx.storageDomain, 'open').mockImplementationOnce(async spec => {
      const domain = await open(spec)
      entered()
      await held
      return domain
    })
    const replacement = h.ctx.plugin(Roller)
    const settled = Promise.resolve(replacement).then(() => undefined, error => error)
    await opening
    const disposing = replacement.dispose()
    release()
    await Promise.all([settled, disposing])
    intercepted.mockRestore()
    // Compare a boolean: pretty-format must not inspect Cordis service proxies.
    expect(h.ctx.storageDomain.get('roller') === undefined).toBe(true)
    expect(await h.ctx.commands.execute(h.owner, '/roller-restore start', [], new AbortController().signal)).toBeUndefined()
    const target = await h.ctx.fs.resolve('after-disposal.txt', { cwd: h.root })
    for (const event of ['fs/write-intent', 'fs/edit-intent', 'fs/delete-intent'] as const) {
      let reached = false
      await h.ctx.waterfall(event, target, { name: 'write', arguments: { file_path: 'after-disposal.txt' }, agent: h.owner }, () => { reached = true })
      expect(reached).toBe(true)
    }
    const fresh = h.ctx.plugin(Roller)
    await fresh
    await fresh.dispose()
    expect(h.ctx.storageDomain.get('roller') === undefined).toBe(true)
  })

  it('observes a storage-open rejection during disposal without an unhandled rejection or stale registration', async () => {
    const h = await harness({ fsPolicy: false })
    await h.roller.dispose()
    let entered!: () => void, release!: () => void
    const opening = new Promise<void>(resolve => { entered = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    const unhandled: unknown[] = []
    const record = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', record)
    const intercepted = vi.spyOn(h.ctx.storageDomain, 'open').mockImplementationOnce(async () => {
      entered()
      await held
      throw new Error('held open rejected during disposal')
    })
    try {
      const replacement = h.ctx.plugin(Roller)
      const settled = Promise.resolve(replacement).then(() => undefined, error => error)
      await opening
      const disposing = replacement.dispose()
      release()
      await Promise.allSettled([settled, disposing])
      await new Promise<void>(resolve => { setImmediate(resolve) })
      expect(unhandled).toEqual([])
      expect(h.ctx.storageDomain.get('roller') === undefined).toBe(true)
      expect(await h.ctx.commands.execute(h.owner, '/roller-restore start', [], new AbortController().signal)).toBeUndefined()
    } finally {
      intercepted.mockRestore()
      process.off('unhandledRejection', record)
    }
  })

  it('reopens durable records in a fresh process and quarantines later captures after unknown-state', async () => {
    const h = await harness()
    const file = join(h.root, 'durable.txt')
    await writeFile(file, 'before\n')
    await callSuccessfully(h, 'read', { file_path: file })
    await callSuccessfully(h, 'write', { file_path: file, content: 'after\n' })
    const saved = [...h.checkpoints.entries()]
    await h.roller.dispose()
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/reopen-journal.mjs', import.meta.url)), h.storageRoot], { encoding: 'utf8' })
    expect(child.status, child.stderr).toBe(0)
    expect(JSON.parse(child.stdout)).toEqual(saved)
    const kv = h.ctx.storage.backend.get('json').kv!
    const open = kv.open.bind(kv)
    const failure = new StorageError('unknown-state', 'injected uncertain medium')
    let writes = 0
    const intercepted = vi.spyOn(kv, 'open').mockImplementationOnce(async descriptor => {
      const unit = await open(descriptor)
      vi.spyOn(unit, 'putRecord').mockImplementationOnce(async () => { writes++; throw failure })
      return unit
    })
    const replacement = h.ctx.plugin(Roller)
    await replacement
    const table = h.ctx.storageDomain.get('roller')!.table('checkpoints')
    for (const name of ['first-refused.txt', 'later-refused.txt']) {
      const result = await call(h, 'write', { file_path: name, content: 'must not land\n' })
      expect(result.isError).toBe(true)
      expect(result.error?.message).toContain('injected uncertain medium')
      await expect(readFile(join(h.root, name))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    expect(writes).toBe(1)
    expect(() => table.entries()).toThrow(failure)
    await replacement.dispose()
    intercepted.mockRestore()
    const fresh = h.ctx.plugin(Roller)
    await fresh
    const restored = await h.ctx.commands.execute(h.owner, '/roller-restore start', [], new AbortController().signal)
    expect(restored?.result.text).toContain('Failed (0):')
    expect(await readFile(file, 'utf8')).toBe('before\n')
  })

  it('adds zero bytes to native model-facing prompt and tool assembly', async () => {
    const h = await harness()
    const withRoller = JSON.stringify(await h.ctx.systemPrompt.assemble({ scope: h.owner }))
    const tools = JSON.stringify(h.ctx.tools.schemas(h.owner))
    await h.roller.dispose()
    const without = JSON.stringify(await h.ctx.systemPrompt.assemble({ scope: h.owner }))
    expect(withRoller).toBe(without)
    expect(JSON.stringify(h.ctx.tools.schemas(h.owner))).toBe(tools)
    const digest = createHash('sha256').update(withRoller).digest('hex')
    process.stdout.write(`roller prefix: ${Buffer.byteLength(withRoller)} bytes sha256 ${digest}; own delta 0 bytes (native assembly, not provider wire)\n`)
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
