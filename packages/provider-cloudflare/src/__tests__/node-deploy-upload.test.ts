import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as ChildProcess from 'node:child_process'
import type { GeneratedBundle } from '@awaitstep/codegen'

/**
 * What the Node deploy hands `wrangler deploy` — its arguments, the
 * credentials in its environment, and every file of the workspace and the
 * checked build — recorded at the moment of the upload. The fixture was
 * captured from the deployer before `build()` was split out of `deploy()`;
 * the upload must stay byte for byte what it was.
 *
 * Regenerate (only for a deliberate change to the upload):
 * `UPDATE_UPLOAD_FIXTURE=1 pnpm vitest run node-deploy-upload`.
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/node-deploy-upload.json', import.meta.url))

interface Upload {
  args: string[]
  credentials: Record<string, string | undefined>
  files: Record<string, string>
}

const uploads: Upload[] = []
// Set to make the build step fail as a wrangler run does: an Error with `stderr`.
const buildDirs = vi.hoisted(() => [] as { dir: string; outdir: string }[])
const buildFailure = vi.hoisted(() => ({ error: null as (Error & { stderr?: string }) | null }))
const pending: Promise<void>[] = []

async function filesUnder(root: string, prefix: string, into: Record<string, string>) {
  async function walk(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else into[`${prefix}/${relative(root, path)}`] = await readFile(path, 'utf-8')
    }
  }
  await walk(root)
}

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>()
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  return {
    ...actual,
    spawn: (
      command: string,
      args: string[],
      options: { cwd: string; env: Record<string, string | undefined> },
    ) => {
      const child = Object.assign(new EventEmitter(), {
        pid: undefined,
        exitCode: null,
        signalCode: null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => true,
      })
      const isUpload = args.includes('deploy') && !args.includes('--dry-run')
      const recorded = isUpload
        ? (async () => {
            const files: Record<string, string> = {}
            await filesUnder(options.cwd, '<deploy>', files)
            await filesUnder(`${options.cwd}-build`, '<build>', files)
            uploads.push({
              args: [command, ...args].map((arg) =>
                arg.replaceAll(`${options.cwd}-build`, '<build>'),
              ),
              credentials: {
                CLOUDFLARE_ACCOUNT_ID: options.env.CLOUDFLARE_ACCOUNT_ID,
                CLOUDFLARE_API_TOKEN: options.env.CLOUDFLARE_API_TOKEN,
              },
              files,
            })
          })()
        : Promise.resolve()
      pending.push(recorded)
      recorded.then(() => {
        if (isUpload) child.stdout.write('https://awaitstep-orders.example.workers.dev\n')
        setImmediate(() => child.emit('close', 0))
      })
      return child
    },
  }
})

// The real check runs wrangler; this stands in with a fixed build in `outdir`.
vi.mock('../bundle-containment.js', () => ({
  assertBundleContained: () => Promise.resolve(),
  buildContainedBundle: async (dir: string, outdir: string) => {
    buildDirs.push({ dir, outdir })
    if (buildFailure.error) throw buildFailure.error
    await mkdir(outdir, { recursive: true })
    await writeFile(join(outdir, 'worker.js'), 'export default { fetch() {} }\n')
    await writeFile(join(outdir, `${'a'.repeat(40)}-greeting.txt`), 'hello\n')
    return join(outdir, 'worker.js')
  },
  BundleEscapeError: class extends Error {},
}))

vi.mock('../wrangler-exec.js', () => ({
  wranglerCommand: () => ({ command: 'wrangler', args: [] }),
  wranglerEnv: (extra: Record<string, string> = {}) => ({ PATH: '/usr/bin', ...extra }),
}))

const { NodeWranglerDeployer } = await import('../deploy/node-deployer.js')

const bundle: GeneratedBundle = {
  entry: 'worker.ts',
  files: [
    {
      path: 'worker.ts',
      source: 'import g from "./greeting.txt"\nexport default {}',
      role: 'entry',
    },
    { path: 'greeting.txt', source: 'hello\n', role: 'asset' },
    {
      path: 'lib/util.ts',
      source: 'export const x = 1',
      compiled: 'export const x=1',
      role: 'module',
    },
  ],
}

const options = {
  workflowId: 'orders',
  workflowName: 'Orders',
  accountId: 'account-1',
  apiToken: 'token-1',
  vars: { REGION: 'eu' },
  secrets: { API_KEY: 'secret-1', 'bad key': 'skipped' },
  dependencies: { 'left-pad': '1.3.0' },
  bindings: [
    { type: 'kv' as const, name: 'CACHE', source: 'declaration' as const, resourceId: 'kv-1' },
  ],
  routes: [{ pattern: 'orders.example.com/*', zone_name: 'example.com' }],
  cronTriggers: ['*/5 * * * *'],
  compatibilityDate: '2026-01-01',
  compatibilityFlags: ['nodejs_compat'],
  observability: { enabled: true },
}

describe('Node deploy upload', () => {
  it('hands wrangler the same arguments, credentials and files as before build() was split out', async () => {
    const result = await new NodeWranglerDeployer().deploy(bundle, options as never)
    await Promise.all(pending)
    expect(result.success, result.error).toBe(true)
    expect(uploads).toHaveLength(1)

    if (process.env.UPDATE_UPLOAD_FIXTURE) {
      await writeFile(FIXTURE, `${JSON.stringify(uploads[0], null, 2)}\n`)
    }
    expect(uploads[0]).toEqual(JSON.parse(await readFile(FIXTURE, 'utf-8')))
  })
})

describe('Node deployer edge cases', () => {
  afterEach(() => {
    buildFailure.error = null
  })

  it('rejects a workflow name with no letters or digits before writing anything, as before', async () => {
    await expect(
      new NodeWranglerDeployer().deploy(bundle, { ...options, workflowName: '---' } as never),
    ).rejects.toThrow(/alphanumeric/)
    await expect(
      new NodeWranglerDeployer().build(bundle, { ...options, workflowName: '---' } as never),
    ).rejects.toThrow(/alphanumeric/)
  })

  it('gives builds started in the same millisecond their own workspaces', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    buildDirs.length = 0
    const deployer = new NodeWranglerDeployer()
    const both = await Promise.all([
      deployer.build(bundle, options as never),
      deployer.build(bundle, options as never),
    ])
    vi.restoreAllMocks()
    expect(both.map((b) => b.mainModule)).toEqual(['worker.js', 'worker.js'])
    expect(buildDirs).toHaveLength(2)
    expect(buildDirs[0]!.dir).not.toBe(buildDirs[1]!.dir)
    expect(buildDirs[0]!.outdir).not.toBe(buildDirs[1]!.outdir)
  })

  it('throws a failed build with its message when wrangler wrote nothing to stderr', async () => {
    buildFailure.error = Object.assign(new Error('npm install exited with code 1'), { stderr: '' })
    await expect(new NodeWranglerDeployer().build(bundle, options as never)).rejects.toThrow(
      'npm install exited with code 1',
    )
  })
})
