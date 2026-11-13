// A new process reads the real JSON medium through the published domain service.
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { rollerDomainSpec } from '../../lib/index.js'

const ctx = new Context()
try {
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: process.argv[2] })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(rollerDomainSpec)
  console.log(JSON.stringify([...domain.table('checkpoints').entries()]))
  await domain.close()
} finally {
  await ctx.fiber.dispose()
}
