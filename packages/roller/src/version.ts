import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const validatedVersions = JSON.parse(
  readFileSync(new URL('../validated-dsh-versions.json', import.meta.url), 'utf8'),
) as string[]

function runningDshVersion(): string {
  try {
    const entry = realpathSync(process.argv[1] ?? '')
    const manifest = JSON.parse(
      readFileSync(resolve(dirname(entry), '../package.json'), 'utf8'),
    ) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function warnIfUnsupportedDsh(): void {
  const version = runningDshVersion()
  if (!validatedVersions.includes(version)) {
    process.stderr.write(
      `roller: warning: DSH ${version} is not validated; validated: ${validatedVersions.join(', ')}\n`,
    )
  }
}
