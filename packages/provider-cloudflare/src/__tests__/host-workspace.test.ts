import { describe, it, expect, vi, beforeEach } from 'vitest'
import { access } from 'node:fs/promises'
import type * as ChildProcess from 'node:child_process'
import type { GeneratedBundle } from '@awaitstep/codegen'

/**
 * Every host-side wrangler run must pass the containment check before
 * wrangler touches the directory. The check itself is tested against real
 * wrangler elsewhere; here it is made to refuse, and each runner must stop
 * before spawning anything.
 */

const spawned: string[][] = []
const executed: string[][] = []

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>()
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  return {
    ...actual,
    // Records the command and exits 0 with no output: the deploy's upload
    // runs through spawn (in its own process group), and so would a refused
    // test session or local dev, which must never get here.
    spawn: (command: string, args: string[]) => {
      spawned.push([command, ...args])
      const child = Object.assign(new EventEmitter(), {
        pid: undefined,
        exitCode: null,
        signalCode: null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => true,
      })
      setImmediate(() => child.emit('close', 0))
      return child
    },
    execFile: (
      command: string,
      args: string[],
      _options: unknown,
      callback?: (err: Error | null, out?: { stdout: string; stderr: string }) => void,
    ) => {
      executed.push([command, ...args])
      callback?.(null, { stdout: '', stderr: '' })
    },
    exec: (_command: string, callback?: (err: Error | null, stdout?: string) => void) => {
      callback?.(null, '')
    },
  }
})

// `cancel`: the build check is stopped by a cancel, as a real one is when its signal aborts.
let containment: 'refuse' | 'pass' | 'cancel' = 'refuse'
const CHECKED_ENTRY = '/checked-build/worker.js'

vi.mock('../bundle-containment.js', async () => {
  const { DeployCancelledError } = await import('../deploy/run-to-end.js')
  return {
    assertBundleContained: () =>
      containment === 'refuse'
        ? Promise.reject(new Error('refused by containment'))
        : Promise.resolve(),
    buildContainedBundle: () =>
      containment === 'refuse'
        ? Promise.reject(new Error('refused by containment'))
        : containment === 'cancel'
          ? Promise.reject(new DeployCancelledError())
          : Promise.resolve(CHECKED_ENTRY),
    BundleEscapeError: class extends Error {},
  }
})

const { NodeWranglerDeployer } = await import('../deploy/node-deployer.js')
const { NodeTestSessionRunner } = await import('../test-sessions/node-runner.js')
const { startLocalDev } = await import('../local-dev.js')

const bundle: GeneratedBundle = {
  entry: 'worker.ts',
  files: [{ path: 'worker.ts', source: 'export default {}', role: 'entry' }],
}

function wranglerCalls(calls: string[][]): string[][] {
  return calls.filter((call) => call.some((part) => /wrangler/.test(part)))
}

beforeEach(() => {
  spawned.length = 0
  executed.length = 0
  containment = 'refuse'
})

const deployOptions = {
  kind: 'script' as const,
  workflowId: 'wf-1',
  workflowName: 'probe',
  accountId: 'acct',
  apiToken: 'token',
}

describe('host-side wrangler runs check containment first', () => {
  it('a deploy is refused before wrangler deploys', async () => {
    const result = await new NodeWranglerDeployer().deploy(bundle, deployOptions)

    expect(result.success).toBe(false)
    expect(result.error).toContain('refused by containment')
    expect(wranglerCalls(spawned)).toEqual([])
  })

  it('a test session is refused before wrangler dev, and leaves nothing behind', async () => {
    const runner = new NodeTestSessionRunner()

    await expect(
      runner.start(bundle, {
        sessionId: 'sess-refused',
        kind: 'script',
        workflowId: 'wf-1',
        workflowName: 'probe',
      } as Parameters<typeof runner.start>[1]),
    ).rejects.toThrow('refused by containment')

    expect(spawned).toEqual([])
    await expect(access(runner.containerId('sess-refused'))).rejects.toThrow()
  })

  it('local dev is refused before wrangler dev', async () => {
    await expect(
      startLocalDev(bundle, { kind: 'script', workflowId: 'wf-1', workflowName: 'probe' }),
    ).rejects.toThrow('refused by containment')

    expect(spawned).toEqual([])
  })

  it('a deploy uploads the build that was checked, never a second one', async () => {
    // A plain `wrangler deploy` rebuilt from source: the upload was a build
    // the check had only predicted, not the one it read.
    containment = 'pass'
    const result = await new NodeWranglerDeployer().deploy(bundle, deployOptions)

    expect(result.success).toBe(true)
    const deploys = wranglerCalls(spawned).filter((call) => call.includes('deploy'))
    expect(deploys).toHaveLength(1)
    expect(deploys[0]).toEqual(
      expect.arrayContaining(['deploy', '-c', 'wrangler.json', '--no-bundle', CHECKED_ENTRY]),
    )
  })

  it('attaches secrets to that one deploy, never a second secret bulk', async () => {
    containment = 'pass'
    const result = await new NodeWranglerDeployer().deploy(bundle, {
      ...deployOptions,
      secrets: { FOO: 'bar' },
    })

    expect(result.success).toBe(true)
    const wrangler = wranglerCalls(spawned)
    const deploys = wrangler.filter((call) => call.includes('deploy'))
    expect(deploys).toHaveLength(1)
    expect(deploys[0]).toEqual(
      expect.arrayContaining(['deploy', '--secrets-file', '.secrets.bulk.json', CHECKED_ENTRY]),
    )
    expect(wrangler.some((call) => call.includes('secret') && call.includes('bulk'))).toBe(false)
  })
})

describe('a cancelled host deploy', () => {
  it('uploads nothing when the upload is refused, and says cancelled', async () => {
    containment = 'pass'
    const result = await new NodeWranglerDeployer().deploy(bundle, deployOptions, undefined, {
      beforeUpload: async () => false,
    })

    expect(result).toEqual({ success: false, workerName: 'awaitstep-wf-1', cancelled: true })
    expect(wranglerCalls(spawned).filter((call) => call.includes('deploy'))).toEqual([])
  })

  it('answers cancelled, not a failure, when the build is stopped by a cancel', async () => {
    containment = 'cancel'
    const result = await new NodeWranglerDeployer().deploy(bundle, deployOptions, undefined, {
      signal: new AbortController().signal,
    })

    expect(result.cancelled).toBe(true)
    expect(result.error).toBeUndefined()
    expect(wranglerCalls(spawned)).toEqual([])
  })

  it('does not start once already cancelled', async () => {
    containment = 'pass'
    const controller = new AbortController()
    controller.abort()
    const result = await new NodeWranglerDeployer().deploy(bundle, deployOptions, undefined, {
      signal: controller.signal,
    })

    expect(result.cancelled).toBe(true)
    expect(wranglerCalls(spawned)).toEqual([])
  })

  it('asks before the upload, and uploads after a yes', async () => {
    containment = 'pass'
    const asked: string[][] = []
    const result = await new NodeWranglerDeployer().deploy(bundle, deployOptions, undefined, {
      beforeUpload: async () => {
        asked.push(wranglerCalls(spawned).flat())
        return true
      },
    })

    expect(result.success).toBe(true)
    // Nothing had gone to wrangler when it asked.
    expect(asked).toEqual([[]])
    expect(wranglerCalls(spawned).filter((call) => call.includes('deploy'))).toHaveLength(1)
  })
})
