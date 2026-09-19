import { spawnSync } from 'node:child_process'
import {
  mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const dsh = join(root, 'node_modules', '.bin', 'dsh')
const rollerPackage = join(root, 'packages', 'roller')
const replayFixture = join(rollerPackage, 'tests', 'fixtures', 'profile-replay.jsonl')
const { version: dshVersion } = JSON.parse(readFileSync(
  join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8',
)) as { version: string }

interface ProcessResult { stdout: string; stderr: string }

function run(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = root): ProcessResult {
  const result = spawnSync(command, args, {
    cwd, env, encoding: 'utf8', timeout: 120_000,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${String(result.status)}\n${result.stdout}${result.stderr}`,
    )
  }
  return { stdout: result.stdout, stderr: result.stderr }
}

describe('installed profile', () => {
  it('loads in a real headless profile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'roller-profile-'))
    const home = join(directory, 'home')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
    }
    try {
      run('pnpm', ['--dir', rollerPackage, 'pack', '--pack-destination', directory], env)
      const archive = readdirSync(directory).find(name => name.endsWith('.tgz'))
      if (archive === undefined) throw new Error('pnpm pack produced no archive')
      run(dsh, ['plugin', '--profile', 'roller-test', 'add', join(directory, archive)], env)

      const profileDir = join(home, 'profiles', 'roller-test')
      const manifestPath = join(profileDir, 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies: Record<string, string>
        dsh: { profile: { bundles: string[]; patchReload: string } }
      }
      expect(manifest.dependencies).toHaveProperty('@antst/roller')
      expect(manifest.dsh.profile.bundles).toEqual([
        '@deepseek-ai/dsh-base', '@antst/roller',
      ])
      manifest.dsh.profile.bundles.push('@deepseek-ai/dsh-headless')
      manifest.dsh.profile.patchReload = 'startup'
      writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
      run('pnpm', [
        'add', '--save-exact', '--config.resolution-mode=time-based',
        `@deepseek-ai/dsh-llm-replay@${dshVersion}`,
      ], env, profileDir)
      writeFileSync(join(profileDir, 'cordis.patch.yml'), `
- id: llm-deepseek
  disabled: true
- id: session-title-llm
  disabled: true
- insert:
    - id: llm-replay
      name: '@deepseek-ai/dsh-llm-replay'
      config:
        file: !!js process.env.DSH_SNAPSHOT_FILE
        providers:
          - id: deepseek-official
`)
      env.DSH_SNAPSHOT_FILE = replayFixture

      const supported = run(dsh, ['--profile', 'roller-test', 'load roller'], env, directory)
      expect(supported.stdout).toBe('roller profile loaded\n')
      expect(supported.stderr).toBe('')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 180_000)
})
