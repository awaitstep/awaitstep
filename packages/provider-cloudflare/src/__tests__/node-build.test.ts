import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdirSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Miniflare } from 'miniflare'
import type { GeneratedBundle } from '@awaitstep/codegen'
import { NodeWranglerDeployer } from '../deploy/node-deployer.js'
import { DeployCancelledError } from '../deploy/run-to-end.js'
import type { WorkerBuild } from '../deploy/deployer.js'

/** Real wrangler: the build is the one `deploy` would upload. */

const bundle: GeneratedBundle = {
  entry: 'worker.ts',
  files: [
    {
      path: 'worker.ts',
      source: [
        "import greeting from './greeting.txt'",
        "import { suffix } from './lib/suffix'",
        'export default {',
        '  fetch(_request: Request, env: { REGION: string }): Response {',
        '    return new Response(`${greeting.trim()} ${suffix} ${env.REGION}`)',
        '  },',
        '}',
      ].join('\n'),
      role: 'entry',
    },
    { path: 'greeting.txt', source: 'hello\n', role: 'asset' },
    { path: 'lib/suffix.ts', source: "export const suffix = 'from the loader'", role: 'module' },
  ],
}

const options = {
  kind: 'script' as const,
  workflowId: 'greeter',
  workflowName: 'Greeter',
  vars: { REGION: 'eu' },
  compatibilityDate: '2026-01-01',
  cronTriggers: ['*/5 * * * *'],
}

/** The build, loaded the way a host running Workers itself would. */
async function loadAndFetch(build: WorkerBuild): Promise<string> {
  const modules: Record<string, unknown> = {}
  for (const module of build.modules) {
    const text = new TextDecoder().decode(module.content)
    modules[module.name] =
      module.type === 'esm'
        ? { js: text }
        : module.type === 'text'
          ? { text }
          : { data: [...module.content] }
  }
  const config = build.wranglerConfig as {
    compatibility_date: string
    compatibility_flags?: string[]
    vars: Record<string, string>
  }
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: '2026-01-01',
    workerLoaders: { LOADER: {} },
    bindings: { BUILD: JSON.stringify({ mainModule: build.mainModule, modules, config }) },
    script: `export default {
      async fetch(request, env) {
        const { mainModule, modules, config } = JSON.parse(env.BUILD)
        const worker = env.LOADER.get('build', () => ({
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags ?? [],
          mainModule,
          modules,
          env: config.vars,
        }))
        return worker.getEntrypoint().fetch(request)
      },
    }`,
  })
  try {
    const res = await mf.dispatchFetch('http://build.test/')
    return `${res.status} ${await res.text()}`
  } finally {
    await mf.dispose()
  }
}

// Its own root: other test files deploy in parallel, and their workspaces in
// the shared temp directory would read as this build's leftovers.
let workRoot: string
const deployer = () => new NodeWranglerDeployer({ workRoot })

async function workspaceDirs(): Promise<string[]> {
  return (await readdir(workRoot)).filter((name) => name.startsWith('awaitstep-deploy-'))
}

describe('NodeWranglerDeployer.build', () => {
  let build: WorkerBuild
  let leftBehind: string[]
  let madeInRoot = false

  beforeAll(async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'awaitstep-node-build-'))
    const before = new Set(await workspaceDirs())
    build = await deployer().build(bundle, options, () => {
      madeInRoot ||= readdirSync(workRoot).some((name) => name.startsWith('awaitstep-deploy-'))
    })
    leftBehind = (await workspaceDirs()).filter((dir) => !before.has(dir))
  }, 120_000)

  afterAll(async () => {
    await rm(workRoot, { recursive: true, force: true })
  })

  it('returns the bundled entry and the modules the upload attaches, and no more', () => {
    expect(build.workerName).toBe('awaitstep-greeter')
    expect(build.mainModule).toBe('worker.js')
    const names = build.modules.map((m) => [m.name, m.type])
    expect(names[0]).toEqual(['worker.js', 'esm'])
    expect(names).toHaveLength(2)
    expect(names[1]![0]).toMatch(/^[0-9a-f]{40}-greeting\.txt$/)
    expect(names[1]![1]).toBe('text')
    // wrangler's README and the source map stay behind; the project module is bundled in.
    expect(names.some(([name]) => /README|\.map$|suffix/.test(name!))).toBe(false)
    expect(madeInRoot).toBe(true)
    expect(leftBehind).toEqual([])
  })

  it('returns the wrangler config it built with, as an object', () => {
    expect(build.wranglerConfig).toMatchObject({
      name: 'awaitstep-greeter',
      compatibility_date: '2026-01-01',
      vars: { REGION: 'eu' },
      triggers: { crons: ['*/5 * * * *'] },
    })
  })

  it('builds modules a Worker Loader runs', async () => {
    expect(await loadAndFetch(build)).toBe('200 hello from the loader eu')
  }, 60_000)

  it('throws the build failure, redacted, and leaves no workspace behind', async () => {
    const before = new Set(await workspaceDirs())
    const broken: GeneratedBundle = {
      entry: 'worker.ts',
      files: [
        {
          path: 'worker.ts',
          source: "import './missing-abcdefghijklmnopqrstuvwxyz0123456789'",
          role: 'entry',
        },
      ],
    }
    const failure = await deployer()
      .build(broken, options)
      .catch((err: Error) => err)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('[REDACTED]')
    expect((failure as Error).cause).toBeUndefined()
    expect((await workspaceDirs()).filter((dir) => !before.has(dir))).toEqual([])
  }, 120_000)

  it('throws DeployCancelledError when cancelled before it starts', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      deployer().build(bundle, options, undefined, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(DeployCancelledError)
  })
})
