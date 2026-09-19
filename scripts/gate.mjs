import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const checks = [
  ['typecheck', ['run', 'typecheck']],
  ['build', ['run', 'build']],
  ['lint', ['run', 'lint']],
  ['tests', ['run', 'test']],
]

for (const [label, args] of checks) {
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`gate: ${label} passed`)
}

const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx'])
const forbiddenPackages = [
  /^@deepseek-ai\/dsh$/,
  /^@deepseek-ai\/dsh-cmdline(?:-|$)/,
  /^@deepseek-ai\/dsh-client-ui(?:-|$)/,
  /^@deepseek-ai\/dsh-ui(?:-|$)/,
]
const nodeFsFiles = new Set([
  'packages/roller/src/restore-files.ts',
  'packages/roller/lib/restore-files.js',
])

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  }))
  return nested.flat()
}

function packageViolation(specifier) {
  if (specifier.includes('node_modules') || /^(?:@[^/]+\/[^/]+|[^./][^/]*)\/src(?:\/|$)/.test(specifier)) {
    return 'path import into package source'
  }
  if (forbiddenPackages.some(pattern => pattern.test(specifier))) return 'forbidden DSH package'
}

const failures = []
const testedVersions = JSON.parse(await readFile(
  fileURLToPath(new URL('../packages/roller/tested-dsh-versions.json', import.meta.url)), 'utf8',
))
const rollerManifest = JSON.parse(await readFile(
  fileURLToPath(new URL('../packages/roller/package.json', import.meta.url)), 'utf8',
))
const dshPeers = Object.entries(rollerManifest.peerDependencies ?? {})
  .filter(([name]) => /^@deepseek-ai\/dsh(?:-|$)/u.test(name))
if (dshPeers.length === 0) failures.push('packages/roller/package.json: no DSH peers found')
if (testedVersions.length === 0) failures.push('tested-dsh-versions.json: no tested versions')
for (const [name, version] of dshPeers) {
  if (version !== '>=0.1.5-rc.2') {
    failures.push(`packages/roller/package.json: ${name} peer ${version} must equal >=0.1.5-rc.2`)
  }
}
const lockfile = await readFile(fileURLToPath(new URL('../pnpm-lock.yaml', import.meta.url)), 'utf8')
const packageSection = lockfile.split('\nsnapshots:\n', 1)[0]
const lockedDsh = [...packageSection.matchAll(/^  '?(@deepseek-ai\/dsh[^@']*)@([^':]+)'?:$/gm)]
if (lockedDsh.length === 0) failures.push('pnpm-lock.yaml: no @deepseek-ai/dsh packages found')
for (const [, packageName, version] of lockedDsh) {
  if (!testedVersions.includes(version)) failures.push(`pnpm-lock.yaml: untested ${packageName}@${version}`)
}

const packageFiles = (await filesBelow(fileURLToPath(new URL('../packages', import.meta.url))))
  .filter(path => path.endsWith('package.json'))
for (const path of packageFiles) {
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(manifest[field] ?? {})) {
      const reason = packageViolation(dependency)
      if (reason !== undefined) failures.push(`${relative(root, path)}: ${reason}: ${dependency}`)
    }
  }
}

const sourceFiles = (await Promise.all([
  filesBelow(fileURLToPath(new URL('../packages', import.meta.url))),
  filesBelow(fileURLToPath(new URL('../scripts', import.meta.url))),
])).flat().filter(path => sourceExtensions.has(extname(path)))

for (const path of sourceFiles) {
  const source = await readFile(path, 'utf8')
  const specifiers = [...source.matchAll(/(?:from\s*|(?:import|require)\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)]
    .map(match => match[1])
  const pathFromRoot = relative(root, path)
  for (const specifier of specifiers) {
    const reason = packageViolation(specifier)
    if (reason !== undefined) failures.push(`${pathFromRoot}: ${reason}: ${specifier}`)
    const isProduction = pathFromRoot.startsWith('packages/roller/src/')
      || pathFromRoot.startsWith('packages/roller/lib/')
    if (isProduction && (specifier === 'node:fs' || specifier === 'node:fs/promises')
      && !nodeFsFiles.has(pathFromRoot)) {
      failures.push(`${pathFromRoot}: node:fs is confined to restore-files`)
    }
  }
}

const productionFiles = sourceFiles.filter(path => relative(root, path).startsWith('packages/roller/src/'))
async function lineCount(files) {
  return (await Promise.all(files.map(path => readFile(path, 'utf8'))))
    .reduce((total, source) => total + source.split('\n').length - 1, 0)
}
const productionLines = await lineCount(productionFiles)
const captureLines = await lineCount(productionFiles.filter(path =>
  /\/(?:capture|index|spec)\.ts$/u.test(path)))
const restoreLines = await lineCount(productionFiles.filter(path =>
  /\/(?:format|index|restore|restore-files)\.ts$/u.test(path)))
const formatterLines = await lineCount(productionFiles.filter(path => path.endsWith('/format.ts')))
if (captureLines >= 400) failures.push(`capture source is ${captureLines} lines; must remain below 400`)
if (restoreLines >= 300) failures.push(`restore source is ${restoreLines} lines; must remain below 300`)
if (formatterLines >= 40) failures.push(`restore formatter is ${formatterLines} lines; must remain below 40`)

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`gate: DSH versions passed (${lockedDsh.length} packages; ${dshPeers.length} peers >=0.1.5-rc.2; tested ${testedVersions.join(', ')})`)
console.log(`gate: import lint passed (${sourceFiles.length} source files; ${productionLines} production lines; ${restoreLines} restore lines)`)
console.log('gate: PASS — typecheck, build, lint, tests, DSH versions, import lint')
