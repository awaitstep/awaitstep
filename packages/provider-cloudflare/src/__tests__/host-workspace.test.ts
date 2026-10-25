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
  return {
    ...actual,
    spawn: (command: string, args: string[]) => {
      spawned.push([command, ...args])
      throw new Error('spawn must not be reached')
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

vi.mock('../bundle-containment.js', () => ({
  assertBundleContained: () => Promise.reject(new Error('refused by containment')),
  BundleEscapeError: class extends Error {},
}))

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
})

describe('host-side wrangler runs check containment first', () => {
  it('a deploy is refused before wrangler deploys', async () => {
    const result = await new NodeWranglerDeployer().deploy(bundle, {
      kind: 'script',
      workflowId: 'wf-1',
      workflowName: 'probe',
      accountId: 'acct',
      apiToken: 'token',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('refused by containment')
    expect(wranglerCalls(executed)).toEqual([])
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
})
