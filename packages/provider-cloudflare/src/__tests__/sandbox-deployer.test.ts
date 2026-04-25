import { describe, it, expect, vi } from 'vitest'
import { SandboxWranglerDeployer } from '../deploy/sandbox-deployer.js'
import type { GeneratedArtifact } from '@awaitstep/codegen'

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
      return { success: r.success, stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: 0 }
    },
    async destroy() {
      fake.destroyed = true
    },
  }
  return fake
}

const artifact: GeneratedArtifact = {
  filename: 'worker.js',
  source: 'export class Test {}',
  compiled: 'export class Test {}',
}

const baseOptions = {
  workflowId: 'my-workflow',
  workflowName: 'my-workflow',
  accountId: 'abc123',
  apiToken: 'token123',
}

describe('SandboxWranglerDeployer', () => {
  it('uploads secrets via `wrangler secret bulk` with a JSON file', async () => {
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

    const result = await deployer.deploy(artifact, {
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

    const bulkCall = lastSandbox!.execCalls.find((c) => c.command.includes('secret bulk'))
    expect(bulkCall).toBeDefined()
    expect(bulkCall!.command).toBe(
      'npx wrangler secret bulk .secrets.bulk.json --name awaitstep-my-workflow',
    )
    expect(bulkCall!.cwd).toBe('/workspace')
    expect(bulkCall!.env?.CLOUDFLARE_API_TOKEN).toBe('token123')

    const cleanupCall = lastSandbox!.execCalls.find((c) => c.command.startsWith('rm -f'))
    expect(cleanupCall).toBeDefined()
  })

  it('does not call `wrangler secret put` (legacy stdin-based path)', async () => {
    let lastSandbox: FakeSandbox | undefined
    const deployer = new SandboxWranglerDeployer((_id: string) => {
      lastSandbox = makeFakeSandbox(() => ({ success: true, stdout: 'deployed' }))
      return lastSandbox
    })

    await deployer.deploy(artifact, {
      ...baseOptions,
      secrets: { FOO: 'bar' },
    })

    const putCall = lastSandbox!.execCalls.find((c) => c.command.includes('secret put'))
    expect(putCall).toBeUndefined()
  })

  it('returns failure when the bulk upload fails and reports a redacted error', async () => {
    const longToken = 'A'.repeat(40)
    const deployer = new SandboxWranglerDeployer(() =>
      makeFakeSandbox((cmd) => {
        if (cmd.includes('wrangler deploy')) return { success: true, stdout: 'deployed' }
        if (cmd.includes('secret bulk')) {
          return { success: false, stderr: `auth failed token=${longToken}` }
        }
        return { success: true }
      }),
    )

    const result = await deployer.deploy(artifact, {
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

    await deployer.deploy(artifact, baseOptions)

    expect(lastSandbox!.files.has('/workspace/.secrets.bulk.json')).toBe(false)
    const bulkCall = lastSandbox!.execCalls.find((c) => c.command.includes('secret bulk'))
    expect(bulkCall).toBeUndefined()
  })

  it('skips invalid secret keys but still uploads valid ones', async () => {
    let lastSandbox: FakeSandbox | undefined
    const progress = vi.fn()
    const deployer = new SandboxWranglerDeployer(() => {
      lastSandbox = makeFakeSandbox(() => ({ success: true, stdout: 'deployed' }))
      return lastSandbox
    })

    await deployer.deploy(
      artifact,
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
