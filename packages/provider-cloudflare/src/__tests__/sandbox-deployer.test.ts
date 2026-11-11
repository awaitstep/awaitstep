import { describe, it, expect, vi } from 'vitest'
import { SandboxWranglerDeployer, withoutWorkerUrl } from '../deploy/sandbox-deployer.js'
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

  it('records the workers.dev address over a route, and the route when there is no other', async () => {
    const deployWith = (stdout: string) =>
      new SandboxWranglerDeployer(() =>
        makeFakeSandbox((cmd) =>
          cmd.includes('wrangler deploy') ? { success: true, stdout } : { success: true },
        ),
      ).deploy(bundle, {
        ...baseOptions,
        routes: [{ pattern: 'api.acme.com/*', zone_name: 'acme.com' }],
      })
    // A function is called from the server at its workers.dev address, never a typed route.
    expect((await deployWith('https://my-worker.example.workers.dev')).workerUrl).toBe(
      'https://my-worker.example.workers.dev',
    )
    expect((await deployWith('deployed')).workerUrl).toBe('https://api.acme.com')
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
