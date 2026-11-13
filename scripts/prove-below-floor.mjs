// Native add-time refusal, not a manual semver assertion or an old-runtime boot.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const archive = resolve(process.argv[2])
const evidence = resolve(process.argv[3])
mkdirSync(evidence, { recursive: true })
const scratch = mkdtempSync(join(tmpdir(), 'roller-below-floor-'))
const home = join(scratch, 'home')
const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1',
  npm_config_store_dir: join(scratch, 'pnpm-store'), npm_config_cache: join(scratch, 'npm-cache') }
const cli = ['--yes', '--package=@deepseek-ai/dsh@0.2.2-rc.2', 'dsh']
function run(args, label) {
  const result = spawnSync('npx', [...cli, ...args], { cwd: scratch, env, encoding: 'utf8', timeout: 180_000 })
  writeFileSync(join(evidence, `${label}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`)
  assert.equal(result.error, undefined)
  return result
}
try {
  const version = run(['--version'], 'version')
  assert.equal(version.status, 0)
  assert.equal(version.stdout.trim(), '0.2.2-rc.2')
  const added = run(['plugin', '--profile', 'roller-floor', 'add', '--save-exact', archive], 'add-refusal')
  assert.notEqual(added.status, 0)
  assert.match(`${added.stdout}${added.stderr}`, /Plugin @antst\/roller@0\.2\.0 is incompatible with dsh 0\.2\.2-rc\.2/u)
  const manifest = JSON.parse(readFileSync(join(home, 'profiles/roller-floor/package.json'), 'utf8'))
  assert.equal(manifest.dependencies?.['@antst/roller'], undefined)
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({
    cliVersion: '0.2.2-rc.2', pluginVersion: '0.2.0', addExit: added.status,
    nativeIncompatibilityObserved: true, pluginAbsentFromManifest: true,
  }, null, 2) + '\n')
  console.log('roller native below-floor add refuses DSH 0.2.2-rc.2 without adding the plugin: PASS')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
