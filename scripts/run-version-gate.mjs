import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveCliPins } from './dsh-cli-pins.mjs'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tested = JSON.parse(readFileSync(join(source, 'packages/roller/tested-dsh-versions.json'), 'utf8'))
const version = process.env.DSH_TEST_VERSION || tested[0]
if (!tested.includes(version)) throw new Error(`DSH ${version} is not in the tested matrix`)
const temporary = version === tested[0] ? undefined : mkdtempSync(join(tmpdir(), 'roller-version-gate-'))
const workspace = temporary === undefined ? source : join(temporary, 'workspace')

function run(args, pins = {}) {
  const result = spawnSync('pnpm', args, {
    cwd: workspace,
    env: { ...process.env, DSH_TEST_VERSION: version, DSH_CLI_PINS: JSON.stringify(pins) },
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} exited ${String(result.status)}`)
}

try {
  if (temporary === undefined) {
    run(['install', '--frozen-lockfile'])
    run(['gate'])
  } else {
    cpSync(source, workspace, { recursive: true, filter(path) {
      const parts = relative(source, path).split(sep)
      return !parts.some(part => ['.git', '.pnpm-store', 'node_modules'].includes(part))
    } })
    const declared = JSON.parse(execFileSync('npm', ['view', `@deepseek-ai/dsh@${version}`, 'dependencies', '--json'], { encoding: 'utf8' }))
    const appBoot = JSON.parse(execFileSync('npm', ['view', `@deepseek-ai/dsh-app-boot@${version}`, 'peerDependencies', '--json'], { encoding: 'utf8' }))
    const pins = deriveCliPins({ ...declared, ...appBoot })
    const workspaceFile = join(workspace, 'pnpm-workspace.yaml')
    const original = readFileSync(workspaceFile, 'utf8')
    const catalogStart = original.indexOf('\ncatalog:\n')
    if (catalogStart < 0) throw new Error('pnpm workspace has no catalog')
    let updated = original.slice(catalogStart)
      .replace(/^(  '@deepseek-ai\/dsh(?:-[^']+)?': )\S+$/gm, `$1${version}`)
    for (const [name, pin] of Object.entries(pins)) {
      const line = new RegExp(`^  '${name}': \\S+$`, 'm')
      if (!line.test(updated)) throw new Error(`catalog has no ${name} CLI pin`)
      updated = updated.replace(line, `  '${name}': ${pin}`)
    }
    writeFileSync(workspaceFile, original.slice(0, catalogStart) + updated)
    rmSync(join(workspace, 'pnpm-lock.yaml'))
    run(['install', '--no-frozen-lockfile'], pins)
    run(['gate'], pins)
  }
} finally {
  if (temporary !== undefined) rmSync(temporary, { recursive: true, force: true })
}
