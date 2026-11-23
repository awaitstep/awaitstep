import { describe, it, expect, vi } from 'vitest'
import { SandboxWranglerDeployer, withoutWorkerUrl } from '../deploy/sandbox-deployer.js'
import { DeployCancelledError } from '../deploy/run-to-end.js'
import { toBundle } from '@awaitstep/codegen'

interface ExecCall {
  command: string
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: string
}

interface FakeSandbox {
  files: Map<string, string>
  execCalls: ExecCall[]
  destroyed: boolean
  writeFile(path: string, content: string): Promise<void>
  exec(
    command: string,
    options?: {
      cwd?: string
      env?: Record<string, string | undefined>
      stdin?: string
      onOutput?: (s: string, d: string) => void
      stream?: boolean
    },
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  destroy(): Promise<void>
}

function makeFakeSandbox(
  execHandler: (cmd: string) => { success: boolean; stdout?: string; stderr?: string },
): FakeSandbox {
  const fake: FakeSandbox = {
    files: new Map(),
    execCalls: [],
    destroyed: false,
    async writeFile(path, content) {
      fake.files.set(path, content)
    },
    async exec(command, options) {
      fake.execCalls.push({
        command,
        cwd: options?.cwd,
        env: options?.env,
        stdin: options?.stdin,
      })
      const r = execHandler(command)
      if (options?.stream && r.stdout) options.onOutput?.('stdout', r.stdout)
      return { success: r.success, stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: 0 }
    },
    async destroy() {
      fake.destroyed = true
    },
  }
  return fake
}

const bundle = toBundle({
  filename: 'worker.js',
  source: 'export class Test {}',
  compiled: 'export class Test {}',
})

const baseOptions = {
  workflowId: 'my-workflow',
  workflowName: 'my-workflow',
  accountId: 'abc123',
  apiToken: 'token123',
}

describe('SandboxWranglerDeployer', () => {
  it('attaches secrets to the deploy with `--secrets-file`', async () => {
    let lastSandbox: FakeSandbox | undefined
    const deployer = new SandboxWranglerDeployer((id: string) => {
      expect(id).toBeDefined()
      lastSandbox = makeFakeSandbox((cmd) => {
        if (cmd.includes('wrangler deploy')) {
          return { success: true, stdout: 'https://my-worker.example.workers.dev' }
        }
        return { success: true }
      })
      return lastSandbox
    })

    const result = await deployer.deploy(bundle, {
      ...baseOptions,
      secrets: { AWS_ACCESS_KEY_ID: 'AKIA', AWS_SECRET_ACCESS_KEY: 's3cr3t' },
    })

    expect(result.success).toBe(true)
    expect(lastSandbox).toBeDefined()
    expect(lastSandbox!.destroyed).toBe(true)

    expect(lastSandbox!.files.get('/workspace/.secrets.bulk.json')).toBeDefined()
    expect(JSON.parse(lastSandbox!.files.get('/workspace/.secrets.bulk.json')!)).toEqual({
      AWS_ACCESS_KEY_ID: 'AKIA',
      AWS_SECRET_ACCESS_KEY: 's3cr3t',
    })

    const deployCall = lastSandbox!.execCalls.find((c) => c.command.startsWith('wrangler deploy'))
    expect(deployCall).toBeDefined()
    expect(deployCall!.command).toBe('wrangler deploy --secrets-file .secrets.bulk.json')
    expect(deployCall!.cwd).toBe('/workspace')
    expect(deployCall!.env?.CLOUDFLARE_API_TOKEN).toBe('token123')

    // A second `secret bulk` would create a second version/deployment.
    expect(lastSandbox!.execCalls.some((c) => c.command.includes('secret bulk'))).toBe(false)
  })

  it('records the route over the workers.dev address, and workers.dev when there is no route', async () => {
    const deployWith = (stdout: string, routes?: Array<{ pattern: string; zone_name: string }>) =>
      new SandboxWranglerDeployer(() =>
        makeFakeSandbox((cmd) =>
          cmd.includes('wrangler deploy') ? { success: true, stdout } : { success: true },
        ),
      ).deploy(bundle, { ...baseOptions, ...(routes && { routes }) })
    const route = [{ pattern: 'api.acme.com/v1/*', zone_name: 'acme.com' }]
    // The user's own URL first: their handler is what callers reach there.
    expect((await deployWith('https://my-worker.example.workers.dev', route)).workerUrl).toBe(
      'https://api.acme.com/v1/',
    )
    expect((await deployWith('https://my-worker.example.workers.dev')).workerUrl).toBe(
      'https://my-worker.example.workers.dev',
    )
    expect((await deployWith('deployed')).workerUrl).toBeUndefined()
  })

  it('keeps the worker’s workers.dev URL out of the progress it streams', async () => {
    const lines: string[] = []
    const deployer = new SandboxWranglerDeployer(() =>
      makeFakeSandbox((cmd) =>
        cmd.includes('wrangler deploy')
          ? {
              success: true,
              stdout: 'Deployed my-worker triggers\n  https://my-worker.acme.workers.dev',
            }
          : { success: true },
      ),
    )
    const result = await deployer.deploy(bundle, baseOptions, (_stage, message) => {
      lines.push(message)
    })
    // The server still records it: it is the address a function is called at.
    expect(result.workerUrl).toBe('https://my-worker.acme.workers.dev')
    expect(lines.join('\n')).toContain('<workers.dev URL>')
    expect(lines.join('\n')).not.toContain('acme.workers.dev')
    expect(withoutWorkerUrl('see https://a.b.workers.dev/x now')).toBe('see <workers.dev URL> now')
  })

  it('does not call `wrangler secret put` (legacy stdin-based path)', async () => {
    let lastSandbox: FakeSandbox | undefined
    const deployer = new SandboxWranglerDeployer((_id: string) => {
      lastSandbox = makeFakeSandbox(() => ({ success: true, stdout: 'deployed' }))
      return lastSandbox
    })

    await deployer.deploy(bundle, {
      ...baseOptions,
      secrets: { FOO: 'bar' },
    })

    const putCall = lastSandbox!.execCalls.find((c) => c.command.includes('secret put'))
    expect(putCall).toBeUndefined()
  })

  it('returns failure when the deploy with secrets fails and reports a redacted error', async () => {
    const longToken = 'A'.repeat(40)
    const deployer = new SandboxWranglerDeployer(() =>
      makeFakeSandbox((cmd) => {
        if (cmd.includes('wrangler deploy')) {
          return { success: false, stderr: `auth failed token=${longToken}` }
        }
        return { success: true }
      }),
    )

    const result = await deployer.deploy(bundle, {
      ...baseOptions,
      secrets: { FOO: 'bar' },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('[REDACTED]')
    expect(result.error).not.toContain(longToken)
  })

  it('skips the bulk step when no secrets are provided', async () => {
    let lastSandbox: FakeSandbox | undefined
    const deployer = new SandboxWranglerDeployer(() => {
      lastSandbox = makeFakeSandbox(() => ({ success: true, stdout: 'deployed' }))
      return lastSandbox
    })

    await deployer.deploy(bundle, baseOptions)

    expect(lastSandbox!.files.has('/workspace/.secrets.bulk.json')).toBe(false)
    const deployCall = lastSandbox!.execCalls.find((c) => c.command.startsWith('wrangler deploy'))
    expect(deployCall!.command).toBe('wrangler deploy')
    expect(lastSandbox!.execCalls.some((c) => c.command.includes('secret bulk'))).toBe(false)
  })

  it('skips invalid secret keys but still uploads valid ones', async () => {
    let lastSandbox: FakeSandbox | undefined
    const progress = vi.fn()
    const deployer = new SandboxWranglerDeployer(() => {
      lastSandbox = makeFakeSandbox(() => ({ success: true, stdout: 'deployed' }))
      return lastSandbox
    })

    await deployer.deploy(
      bundle,
      {
        ...baseOptions,
        secrets: { GOOD: 'v', '1bad': 'x' },
      },
      progress,
    )

    expect(JSON.parse(lastSandbox!.files.get('/workspace/.secrets.bulk.json')!)).toEqual({
      GOOD: 'v',
    })
    expect(progress).toHaveBeenCalledWith(
      'UPLOADING_SECRETS',
      expect.stringContaining('Skipping invalid secret key "1bad"'),
    )
  })
})

describe('SandboxWranglerDeployer.build', () => {
  const BUILD = '/tmp/awaitstep-build'
  const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

  /** A sandbox whose dry run leaves a build behind, as wrangler's does. */
  function buildingSandbox(dryRun: { success: boolean; stderr?: string } = { success: true }) {
    const fake = makeFakeSandbox(() => ({ success: true }))
    const exec = fake.exec.bind(fake)
    fake.exec = async (command, options) => {
      const result = await exec(command, options)
      if (command.includes('--dry-run')) {
        if (!dryRun.success) return { ...result, success: false, stderr: dryRun.stderr ?? '' }
        fake.files.set(`${BUILD}/worker.js`, 'export default {}')
        fake.files.set(`${BUILD}/${'b'.repeat(40)}-greeting.txt`, 'hello')
        fake.files.set(`${BUILD}/engine.wasm`, String.fromCharCode(...wasm))
        fake.files.set(`${BUILD}/README.md`, 'readme')
        fake.files.set(`${BUILD}/worker.js.map`, '{}')
        fake.files.set(
          '/tmp/awaitstep-build-meta.json',
          JSON.stringify({
            outputs: {
              '../tmp/awaitstep-build/worker.js': { entryPoint: 'worker.js' },
              '../tmp/awaitstep-build/worker.js.map': {},
            },
          }),
        )
      }
      if (command.startsWith('find ')) {
        const listed = [...fake.files.keys()].filter((p) => p.startsWith(`${BUILD}/`))
        return { ...result, stdout: `${listed.join('\n')}\n` }
      }
      return result
    }
    const readFile = async (path: string) => {
      const content = fake.files.get(path)
      if (content === undefined) return { success: false, content: '' }
      const binary = path.endsWith('.wasm')
      return {
        success: true,
        content: binary ? btoa(content) : content,
        encoding: binary ? 'base64' : 'utf-8',
      }
    }
    return Object.assign(fake, { readFile })
  }

  const buildOptions = { workflowId: 'my-workflow', workflowName: 'my-workflow', vars: { A: '1' } }

  it('builds with a dry run and returns the entry and the modules the upload attaches', async () => {
    const sandbox = buildingSandbox()
    const build = await new SandboxWranglerDeployer(() => sandbox).build(bundle, buildOptions)

    expect(build.mainModule).toBe('worker.js')
    expect(build.modules.map((m) => [m.name, m.type])).toEqual([
      ['worker.js', 'esm'],
      [`${'b'.repeat(40)}-greeting.txt`, 'text'],
      ['engine.wasm', 'compiled-wasm'],
    ])
    expect([...build.modules[2]!.content]).toEqual([...wasm])
    expect(build.wranglerConfig).toMatchObject({ name: build.workerName, vars: { A: '1' } })
    expect(sandbox.destroyed).toBe(true)
  })

  it('never uploads, and never passes an account or token', async () => {
    const sandbox = buildingSandbox()
    await new SandboxWranglerDeployer(() => sandbox).build(bundle, buildOptions)
    const wranglerRuns = sandbox.execCalls.filter((c) => c.command.startsWith('wrangler'))
    expect(wranglerRuns.map((c) => c.command)).toEqual([
      `wrangler deploy --dry-run --outdir ${BUILD} --metafile /tmp/awaitstep-build-meta.json`,
    ])
    for (const call of sandbox.execCalls) {
      expect(call.env?.CLOUDFLARE_API_TOKEN).toBeUndefined()
      expect(call.env?.CLOUDFLARE_ACCOUNT_ID).toBeUndefined()
    }
  })

  it('throws a failed build redacted, and destroys the sandbox', async () => {
    const sandbox = buildingSandbox({ success: false, stderr: `failed ${'x'.repeat(40)}` })
    const failure = await new SandboxWranglerDeployer(() => sandbox)
      .build(bundle, buildOptions)
      .catch((err: Error) => err)
    expect((failure as Error).message).toBe('failed [REDACTED]')
    expect(sandbox.destroyed).toBe(true)
  })

  it('throws DeployCancelledError when cancelled, without starting a sandbox', async () => {
    const controller = new AbortController()
    controller.abort()
    const getSandbox = vi.fn()
    await expect(
      new SandboxWranglerDeployer(getSandbox).build(bundle, buildOptions, undefined, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(DeployCancelledError)
    expect(getSandbox).not.toHaveBeenCalled()
  })

  it('throws DeployCancelledError when a cancel cuts the build short', async () => {
    const controller = new AbortController()
    const sandbox = buildingSandbox()
    const exec = sandbox.exec.bind(sandbox)
    sandbox.exec = async (command, options) => {
      if (command.includes('--dry-run')) {
        controller.abort()
        throw new Error('container destroyed')
      }
      return exec(command, options)
    }
    await expect(
      new SandboxWranglerDeployer(() => sandbox).build(bundle, buildOptions, undefined, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(DeployCancelledError)
    expect(sandbox.destroyed).toBe(true)
  })
})

describe('SandboxWranglerDeployer workflow names', () => {
  it('rejects a name with no letters or digits before starting a sandbox, as before', async () => {
    const getSandbox = vi.fn()
    const deployer = new SandboxWranglerDeployer(getSandbox)
    const named = { ...baseOptions, workflowName: '---' }
    await expect(deployer.deploy(bundle, named)).rejects.toThrow(/alphanumeric/)
    await expect(deployer.build(bundle, named)).rejects.toThrow(/alphanumeric/)
    expect(getSandbox).not.toHaveBeenCalled()
  })
})

describe('SandboxWranglerDeployer sandbox ids', () => {
  it('gives each run its own container, within the SDK’s 63-character id limit', async () => {
    const ids: string[] = []
    const deployer = new SandboxWranglerDeployer((id: string) => {
      ids.push(id)
      return makeFakeSandbox(() => ({ success: true }))
    })
    const long = { ...baseOptions, workflowId: 'w'.repeat(60) }
    await deployer.deploy(bundle, long)
    await deployer.deploy(bundle, long)
    await deployer.deleteWorker(`awaitstep-${'w'.repeat(60)}`, baseOptions)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(63)
      expect(id).toMatch(/^(deploy|delete)-[0-9a-f-]{36}$/)
    }
  })
})
