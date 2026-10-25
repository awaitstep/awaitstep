import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { assertBundleContained, BundleEscapeError } from '../bundle-containment.js'

/**
 * Real wrangler, real directories. The check exists because imitating
 * wrangler's resolver drifted (platform, loaders, glob expansion, the module
 * collector's own resolution); faking either side would test the imitation
 * again. Each case builds a sandbox holding host files outside the project
 * and a project directory inside it. Slow on purpose: one dry-run per case.
 */

const TIMEOUT = 60_000

let sandbox: string
let project: string

async function write(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function projectWith(files: Record<string, string>) {
  await write(
    join(project, 'wrangler.json'),
    JSON.stringify({
      name: 'containment-probe',
      main: './worker.js',
      compatibility_date: '2025-09-01',
      compatibility_flags: ['nodejs_compat'],
    }),
  )
  for (const [path, content] of Object.entries(files)) {
    await write(join(project, path), content)
  }
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'awaitstep-containment-test-'))
  project = join(sandbox, 'deploy')
  await write(join(sandbox, 'host-secret.json'), '{"token":"host-only"}')
  await write(join(sandbox, 'host-secret.txt'), 'host only')
  await write(join(sandbox, 'host-secret.js'), 'export default "host only"')
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('assertBundleContained', () => {
  it(
    'passes a contained bundle — JS, JSON, assets, built-ins, a JSX .js, a "..data" name',
    async () => {
      await projectWith({
        'worker.js': [
          "import { Buffer } from 'node:buffer'",
          "import b from 'buffer'",
          "import { a } from './lib/a.js'",
          "import data from './..data.json'",
          "import page from './page.html'",
          "import { el } from './lib/jsx.js'",
          'export default { fetch: () => new Response(String(a) + data.ok + page + el + typeof b + Buffer.from("x")) }',
        ].join('\n'),
        'lib/a.js': 'export const a = 1',
        'lib/jsx.js': 'const h = (t) => t\nexport const el = <div>hi</div>',
        '..data.json': '{"ok":true}',
        'page.html': '<p>hi</p>',
      })

      await expect(assertBundleContained(project)).resolves.toBeUndefined()
    },
    TIMEOUT,
  )

  it(
    'refuses a relative import that climbs out to a host file',
    async () => {
      await projectWith({
        'worker.js': "import cfg from '../host-secret.json'\nexport default cfg",
      })

      await expect(assertBundleContained(project)).rejects.toBeInstanceOf(BundleEscapeError)
    },
    TIMEOUT,
  )

  it(
    'refuses a bare name with ".." that only the module collector resolves',
    async () => {
      // esbuild cannot resolve it; wrangler's collector can, and copies the
      // host file into the output under a hash.
      await projectWith({
        'worker.js':
          "import t from 'nope/../../host-secret.txt'\nexport default { fetch: () => new Response(t) }",
      })

      await expect(assertBundleContained(project)).rejects.toBeInstanceOf(BundleEscapeError)
    },
    TIMEOUT,
  )

  it(
    'refuses a glob import that expands to a host file',
    async () => {
      await projectWith({
        'worker.js':
          'const n = "secret"\nexport default { fetch: async () => new Response(JSON.stringify(await import(`../host-${n}.json`))) }',
      })

      await expect(assertBundleContained(project)).rejects.toBeInstanceOf(BundleEscapeError)
    },
    TIMEOUT,
  )

  it(
    'refuses a dependency whose browser map points outside',
    async () => {
      await projectWith({
        'worker.js': "import x from 'mapped'\nexport default { fetch: () => new Response(x) }",
        'node_modules/mapped/package.json': JSON.stringify({
          name: 'mapped',
          main: 'index.js',
          browser: { './index.js': '../../../host-secret.js' },
        }),
        'node_modules/mapped/index.js': 'export default "harmless"',
      })

      await expect(assertBundleContained(project)).rejects.toBeInstanceOf(BundleEscapeError)
    },
    TIMEOUT,
  )

  it(
    'refuses a bare package found in a parent node_modules',
    async () => {
      await write(
        join(sandbox, 'node_modules/leaky/package.json'),
        '{"name":"leaky","main":"i.js"}',
      )
      await write(join(sandbox, 'node_modules/leaky/i.js'), 'export default "outside"')
      await projectWith({
        'worker.js': "import l from 'leaky'\nexport default { fetch: () => new Response(l) }",
      })

      await expect(assertBundleContained(project)).rejects.toBeInstanceOf(BundleEscapeError)
    },
    TIMEOUT,
  )

  it(
    'refuses a symlink inside the project that points out',
    async () => {
      await projectWith({
        'worker.js':
          "import s from './link.json'\nexport default { fetch: () => Response.json(s) }",
      })
      await symlink(join(sandbox, 'host-secret.json'), join(project, 'link.json'))

      await expect(assertBundleContained(project)).rejects.toBeInstanceOf(BundleEscapeError)
    },
    TIMEOUT,
  )

  it(
    'fails closed when wrangler cannot build the bundle',
    async () => {
      await projectWith({ 'worker.js': 'export default {{{' })

      await expect(assertBundleContained(project)).rejects.toThrow(/Could not check/)
    },
    TIMEOUT,
  )
})
