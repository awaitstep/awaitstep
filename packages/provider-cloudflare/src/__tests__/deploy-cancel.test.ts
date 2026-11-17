import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import type { DeployProgressEvent, ProviderConfig } from '@awaitstep/codegen'
import { toBundle } from '@awaitstep/codegen'
import { CloudflareWorkflowsAdapter } from '../adapter.js'
import type { DeployControl, WranglerDeployer } from '../deploy/deployer.js'
import { SandboxWranglerDeployer } from '../deploy/sandbox-deployer.js'
import { DeployCancelledError, killTrackedGroups, runToEnd } from '../deploy/run-to-end.js'

// A deploy can be cancelled until it uploads: every layer stops what it runs
// and answers `cancelled`, never a failure, and past the upload nothing stops it.

const ir: WorkflowIR = {
  metadata: {
    name: 'cancel-probe',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

const config: ProviderConfig = {
  provider: 'cloudflare',
  credentials: { accountId: 'acc', apiToken: 'tok' },
  options: { workflowId: 'cancel-probe', workflowName: 'cancel-probe' },
}

/** A deployer that asks before uploading, as both real ones do. */
function askingDeployer(seen: { control?: DeployControl; uploaded: boolean }): WranglerDeployer {
  return {
    async deploy(_bundle, _options, onProgress, control) {
      seen.control = control
      onProgress?.('INSTALLING_DEPS', 'Installing 1 dependency...')
      if (control?.signal?.aborted) return { success: false, workerName: 'w', cancelled: true }
      if (control?.beforeUpload && !(await control.beforeUpload())) {
        return { success: false, workerName: 'w', cancelled: true }
      }
      seen.uploaded = true
      onProgress?.('DEPLOYING', 'Uploaded 1 file')
      return { success: true, workerName: 'w' }
    },
    async deleteWorker() {
      return { success: true }
    },
  }
}

describe('the adapter', () => {
  it('ends cancelled, with a CANCELLED stage, when the upload is refused', async () => {
    const seen = { uploaded: false } as { control?: DeployControl; uploaded: boolean }
    const adapter = new CloudflareWorkflowsAdapter({ deployer: askingDeployer(seen) })
    const stages: string[] = []
    const result = await adapter.deploy(adapter.generate(ir), config, {
      onProgress: (p: DeployProgressEvent) => stages.push(p.stage),
      beforeUpload: async () => false,
    })
    expect(result).toEqual({ success: false, deploymentId: '', cancelled: true })
    expect(seen.uploaded).toBe(false)
    expect(stages.at(-1)).toBe('CANCELLED')
    expect(stages).not.toContain('UPLOADING')
    expect(stages).not.toContain('FAILED')
  })

  it('reports UPLOADING from the upload on, and the deployer’s later lines under it', async () => {
    const seen = { uploaded: false } as { control?: DeployControl; uploaded: boolean }
    const adapter = new CloudflareWorkflowsAdapter({ deployer: askingDeployer(seen) })
    const events: DeployProgressEvent[] = []
    const result = await adapter.deploy(adapter.generate(ir), config, {
      onProgress: (p) => events.push(p),
      beforeUpload: async () => true,
    })
    expect(result.success).toBe(true)
    const stages = events.map((e) => e.stage)
    const uploadAt = stages.indexOf('UPLOADING')
    expect(uploadAt).toBeGreaterThan(stages.indexOf('DEPLOYING'))
    // The install line came before the upload; the deployer's "Uploaded" after it.
    expect(events.find((e) => e.message.startsWith('Installing'))?.stage).toBe('DEPLOYING')
    expect(events.find((e) => e.message === 'Uploaded 1 file')?.stage).toBe('UPLOADING')
  })

  it('does not reach the deployer when already cancelled', async () => {
    const seen = { uploaded: false } as { control?: DeployControl; uploaded: boolean }
    const adapter = new CloudflareWorkflowsAdapter({ deployer: askingDeployer(seen) })
    const controller = new AbortController()
    controller.abort()
    const result = await adapter.deploy(adapter.generate(ir), config, {
      signal: controller.signal,
    })
    expect(result.cancelled).toBe(true)
    expect(seen.control).toBeUndefined()
  })

  it('hands the deployer the signal', async () => {
    const seen = { uploaded: false } as { control?: DeployControl; uploaded: boolean }
    const adapter = new CloudflareWorkflowsAdapter({ deployer: askingDeployer(seen) })
    const controller = new AbortController()
    await adapter.deploy(adapter.generate(ir), config, { signal: controller.signal })
    expect(seen.control?.signal).toBe(controller.signal)
  })
})

interface FakeSandbox {
  commands: string[]
  destroyed: boolean
  writeFile(path: string, content: string): Promise<void>
  exec(command: string): Promise<{ success: boolean; stdout: string; stderr: string }>
  destroy(): Promise<void>
}

/** A sandbox whose npm install runs until the container is destroyed. */
function slowInstallSandbox(): FakeSandbox {
  let release: (() => void) | undefined
  const fake: FakeSandbox = {
    commands: [],
    destroyed: false,
    async writeFile() {},
    async exec(command) {
      fake.commands.push(command)
      if (command.startsWith('npm install')) {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return { success: false, stdout: '', stderr: 'container destroyed' }
      }
      return { success: true, stdout: '', stderr: '' }
    },
    async destroy() {
      fake.destroyed = true
      release?.()
    },
  }
  return fake
}

const sandboxBundle = toBundle({
  filename: 'worker.js',
  source: 'export class Test {}',
  compiled: 'export class Test {}',
})
const sandboxOptions = {
  workflowId: 'cancel-probe',
  workflowName: 'cancel-probe',
  accountId: 'acc',
  apiToken: 'tok',
  dependencies: { 'left-pad': '1.3.0' },
}

describe('the sandbox deployer', () => {
  it('destroys the container on cancel and answers cancelled, not the install’s failure', async () => {
    const sandbox = slowInstallSandbox()
    const deployer = new SandboxWranglerDeployer(() => sandbox)
    const controller = new AbortController()
    const running = deployer.deploy(sandboxBundle, sandboxOptions, undefined, {
      signal: controller.signal,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(sandbox.commands.some((c) => c.startsWith('npm install'))).toBe(true)
    controller.abort()
    const result = await running
    expect(result).toMatchObject({ success: false, cancelled: true })
    expect(result.error).toBeUndefined()
    expect(sandbox.destroyed).toBe(true)
    expect(sandbox.commands.some((c) => c.includes('wrangler deploy'))).toBe(false)
  })

  it('stops during the file writes without going on to install', async () => {
    const controller = new AbortController()
    const commands: string[] = []
    let writes = 0
    // A destroyed container comes back fresh on the next call, as the SDK's does.
    const deployer = new SandboxWranglerDeployer(() => ({
      async writeFile() {
        writes++
        if (writes === 1) controller.abort()
      },
      async exec(command: string) {
        commands.push(command)
        return { success: true, stdout: '', stderr: '' }
      },
      async destroy() {},
    }))
    const result = await deployer.deploy(sandboxBundle, sandboxOptions, undefined, {
      signal: controller.signal,
    })
    expect(result.cancelled).toBe(true)
    expect(commands.some((c) => c.startsWith('npm install'))).toBe(false)
  })

  it('uploads nothing when the upload is refused', async () => {
    const commands: string[] = []
    const deployer = new SandboxWranglerDeployer(() => ({
      async writeFile() {},
      async exec(command: string) {
        commands.push(command)
        return { success: true, stdout: '', stderr: '' }
      },
      async destroy() {},
    }))
    const result = await deployer.deploy(
      sandboxBundle,
      { ...sandboxOptions, dependencies: undefined },
      undefined,
      { beforeUpload: async () => false },
    )
    expect(result.cancelled).toBe(true)
    expect(commands.some((c) => c.includes('wrangler deploy'))).toBe(false)
  })

  it('lets the upload finish once it has started, whatever the signal does', async () => {
    const controller = new AbortController()
    let destroyedDuringUpload = false
    let uploading = false
    const deployer = new SandboxWranglerDeployer(() => ({
      async writeFile() {},
      async exec(command: string) {
        if (command.includes('wrangler deploy')) {
          uploading = true
          controller.abort()
          await new Promise((resolve) => setTimeout(resolve, 5))
          uploading = false
          return { success: true, stdout: 'https://w.example.workers.dev', stderr: '' }
        }
        return { success: true, stdout: '', stderr: '' }
      },
      async destroy() {
        if (uploading) destroyedDuringUpload = true
      },
    }))
    const result = await deployer.deploy(
      sandboxBundle,
      { ...sandboxOptions, dependencies: undefined },
      undefined,
      { signal: controller.signal, beforeUpload: async () => true },
    )
    expect(result.success).toBe(true)
    expect(destroyedDuringUpload).toBe(false)
  })
})

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('runToEnd', () => {
  it('resolves with what the command printed', async () => {
    const out = await runToEnd(process.execPath, ['-e', 'process.stdout.write("hi")'], {
      timeout: 10_000,
    })
    expect(out.stdout).toBe('hi')
  })

  it('rejects a failed command with its output, naming it without its path', async () => {
    const failed = runToEnd(
      process.execPath,
      ['-e', 'process.stderr.write("bad"); process.exit(3)'],
      { timeout: 10_000, label: 'probe' },
    )
    await expect(failed).rejects.toMatchObject({
      stderr: 'bad',
      code: 3,
      killed: false,
      message: 'probe exited with code 3',
    })
    // The message reaches the deployment's row: never the host's paths.
    const missing = await runToEnd('/nonexistent/awaitstep-probe', [], {
      timeout: 10_000,
      label: 'probe',
    }).catch((err: Error) => err)
    expect((missing as Error).message).toBe('probe could not start (ENOENT)')
  })

  it.skipIf(process.platform === 'win32')(
    'kills what may be stopped when the API exits, but never an upload',
    async () => {
      const sleeper = ['-e', 'setInterval(() => {}, 1000)']
      const stoppable = runToEnd(process.execPath, sleeper, { timeout: 30_000 }).catch(
        (err: unknown) => err,
      )
      const upload = runToEnd(process.execPath, sleeper, {
        timeout: 2_000,
        killOnExit: false,
      }).catch((err: unknown) => err)
      await new Promise((resolve) => setTimeout(resolve, 300))
      killTrackedGroups()
      // The stoppable run ends at once (killed); the upload runs on until its own timeout.
      const first = await Promise.race([
        stoppable.then(() => 'stoppable'),
        upload.then(() => 'upload'),
      ])
      expect(first).toBe('stoppable')
      expect(await upload).toMatchObject({ killed: true })
    },
    15_000,
  )

  it.skipIf(process.platform === 'win32')(
    'stops the command and what it started when cancelled',
    async () => {
      // A parent that starts a long-lived child, as wrangler's launcher starts its CLI.
      const { mkdtemp, readFile } = await import('node:fs/promises')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const dir = await mkdtemp(join(tmpdir(), 'run-to-end-'))
      const pidFile = join(dir, 'pid')
      const script = [
        "const { spawn } = require('node:child_process')",
        "const fs = require('node:fs')",
        "const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
        `fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid))`,
        'setInterval(() => {}, 1000)',
      ].join('; ')
      const controller = new AbortController()
      const running = runToEnd(process.execPath, ['-e', script], {
        timeout: 30_000,
        signal: controller.signal,
      })
      let grandchild = 0
      for (let i = 0; i < 50 && !grandchild; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        grandchild = Number(await readFile(pidFile, 'utf-8').catch(() => '0'))
      }
      expect(grandchild).toBeGreaterThan(0)
      expect(alive(grandchild)).toBe(true)
      controller.abort()
      await expect(running).rejects.toBeInstanceOf(DeployCancelledError)
      for (let i = 0; i < 20 && alive(grandchild); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(alive(grandchild)).toBe(false)
    },
    15_000,
  )

  it.skipIf(process.platform === 'win32')(
    'kills a grandchild that ignores SIGTERM after its parent has exited',
    async () => {
      const { mkdtemp, readFile } = await import('node:fs/promises')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const dir = await mkdtemp(join(tmpdir(), 'run-to-end-'))
      const pidFile = join(dir, 'pid')
      // The parent exits on SIGTERM (as npm and wrangler's launcher do); its
      // child traps SIGTERM and keeps the inherited pipes open.
      const script = [
        "const { spawn } = require('node:child_process')",
        "const fs = require('node:fs')",
        "const c = spawn(process.execPath, ['-e', 'process.on(\"SIGTERM\", () => {}); setInterval(() => {}, 1000)'], { stdio: 'inherit' })",
        `fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid))`,
        "process.on('SIGTERM', () => process.exit(0))",
        'setInterval(() => {}, 1000)',
      ].join('; ')
      const controller = new AbortController()
      const running = runToEnd(process.execPath, ['-e', script], {
        timeout: 60_000,
        signal: controller.signal,
      })
      let grandchild = 0
      for (let i = 0; i < 50 && !grandchild; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        grandchild = Number(await readFile(pidFile, 'utf-8').catch(() => '0'))
      }
      expect(alive(grandchild)).toBe(true)
      controller.abort()
      await expect(running).rejects.toBeInstanceOf(DeployCancelledError)
      for (let i = 0; i < 20 && alive(grandchild); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(alive(grandchild)).toBe(false)
    },
    20_000,
  )

  it('refuses to start once already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runToEnd(process.execPath, ['-e', ''], { timeout: 1000, signal: controller.signal }),
    ).rejects.toBeInstanceOf(DeployCancelledError)
  })

  it('stops a command that runs past its timeout', async () => {
    await expect(
      runToEnd(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 200 }),
    ).rejects.toMatchObject({ killed: true })
  })
})
