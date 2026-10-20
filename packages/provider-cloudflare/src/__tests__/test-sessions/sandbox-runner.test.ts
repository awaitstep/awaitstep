import { describe, it, expect } from 'vitest'
import { toBundle } from '@awaitstep/codegen'
import type { TestSessionTarget } from '@awaitstep/codegen'
import { SandboxTestSessionRunner } from '../../test-sessions/sandbox-runner.js'

interface FetchCall {
  url: string
  init: RequestInit
  port?: number
}

function makeFakeSandbox(
  options: {
    execSucceeds?: boolean
    portNeverOpens?: boolean
    logs?: { stdout?: string; stderr?: string }
  } = {},
) {
  const fake = {
    files: new Map<string, string>(),
    execs: [] as string[],
    started: [] as { command: string; options?: { processId?: string; cwd?: string } }[],
    fetchCalls: [] as FetchCall[],
    waitedForPort: [] as { port: number; mode?: string }[],
    sleepAfter: [] as (string | undefined)[],
    destroyed: 0,
    async writeFile(path: string, content: string) {
      fake.files.set(path, content)
    },
    async exec(command: string) {
      fake.execs.push(command)
      return {
        success: options.execSucceeds ?? true,
        stdout: '',
        stderr: 'npm ERR! boom',
        exitCode: 0,
      }
    },
    async startProcess(
      command: string,
      opts?: { processId?: string; cwd?: string; autoCleanup?: boolean },
    ) {
      fake.started.push({ command, options: opts })
      return {
        id: opts?.processId ?? 'generated-id',
        async waitForPort(port: number, waitOptions?: { mode?: string; timeout?: number }) {
          fake.waitedForPort.push({ port, mode: waitOptions?.mode })
          if (options.portNeverOpens) throw new Error('timed out waiting for port')
        },
      }
    },
    async getProcessLogs() {
      return options.logs ?? { stdout: '', stderr: '' }
    },
    async containerFetch(url: string, init: RequestInit, port?: number) {
      fake.fetchCalls.push({ url, init, port })
      // The SDK answers for a port with nothing behind it rather than
      // throwing, which is why readiness cannot be a response check.
      if (options.portNeverOpens) {
        return new Response('no service', { status: 503 })
      }
      return new Response(JSON.stringify({ instanceId: 'inst-1' }), { status: 200 })
    },
    async destroy() {
      fake.destroyed += 1
    },
  }
  return fake
}

const bundle = toBundle({
  filename: 'worker.ts',
  source: 'export default {}',
  compiled: 'export default {}',
})

function target(overrides: Partial<TestSessionTarget> = {}): TestSessionTarget {
  return {
    sessionId: 'S-Abc123',
    workflowId: 'wf-1',
    workflowName: 'My Flow',
    ...overrides,
  }
}

describe('SandboxTestSessionRunner', () => {
  it('derives a container id the API can record before the container exists', () => {
    const runner = new SandboxTestSessionRunner(() => makeFakeSandbox())
    // Lowercased, because the platform lowercases sandbox ids.
    expect(runner.containerId('S-Abc123')).toBe('test-s-abc123')
  })

  it('writes compiled code and starts wrangler as a named process', async () => {
    const sandbox = makeFakeSandbox()
    const runner = new SandboxTestSessionRunner((id, opts) => {
      sandbox.sleepAfter.push(opts?.sleepAfter)
      return sandbox
    })

    const started = await runner.start(bundle, target())

    // `.js`, not `.ts`: uncompiled, `#app/worker` resolves to nothing and a
    // workflow with handler modules never starts.
    expect([...sandbox.files.keys()]).toEqual(
      expect.arrayContaining([
        '/workspace/worker.js',
        '/workspace/wrangler.json',
        '/workspace/package.json',
      ]),
    )
    expect(sandbox.files.has('/workspace/worker.ts')).toBe(false)
    expect(sandbox.started[0]!.command).toContain('wrangler dev')
    // A fixed process id is what lets a later request re-attach to the logs.
    expect(sandbox.started[0]!.options?.processId).toBe('wrangler-dev')
    // Keeping the record is what preserves a crash's output.
    expect(sandbox.started[0]!.options?.autoCleanup).toBe(false)
    expect(started).toEqual({ processId: 'wrangler-dev', port: 8787 })
  })

  it('asks for a container that outlives the session idle window', async () => {
    const sandbox = makeFakeSandbox()
    const asked: (string | undefined)[] = []
    const runner = new SandboxTestSessionRunner((id, opts) => {
      asked.push(opts?.sleepAfter)
      return sandbox
    })
    await runner.start(bundle, target())
    // A container that sleeps before the session expires leaves the API
    // believing a worker is live when wrangler is already gone.
    expect(asked[0]).toBe('30m')
  })

  it('writes secrets as .dev.vars and leaves the file out when there are none', async () => {
    const withSecrets = makeFakeSandbox()
    await new SandboxTestSessionRunner(() => withSecrets).start(
      bundle,
      target({ secrets: { API_KEY: 'shh' } }),
    )
    // Quoted: unquoted, a `#` truncates the value and a newline declares a
    // whole new variable.
    expect(withSecrets.files.get('/workspace/.dev.vars')).toBe('API_KEY="shh"')

    const without = makeFakeSandbox()
    await new SandboxTestSessionRunner(() => without).start(bundle, target())
    expect(without.files.has('/workspace/.dev.vars')).toBe(false)
  })

  it('installs dependencies only when there are some', async () => {
    const none = makeFakeSandbox()
    await new SandboxTestSessionRunner(() => none).start(bundle, target())
    expect(none.execs.filter((cmd) => cmd.startsWith('npm install'))).toHaveLength(0)

    const some = makeFakeSandbox()
    await new SandboxTestSessionRunner(() => some).start(
      bundle,
      target({ dependencies: { nanoid: '5.0.0' } }),
    )
    expect(some.execs.some((cmd) => cmd.startsWith('npm install'))).toBe(true)
  })

  it('fails the start when dependencies cannot be installed', async () => {
    const sandbox = makeFakeSandbox({ execSucceeds: false })
    const runner = new SandboxTestSessionRunner(() => sandbox)
    await expect(
      runner.start(bundle, target({ dependencies: { nanoid: '5.0.0' } })),
    ).rejects.toThrow(/Dependency install failed/)
  })

  it('waits on the port itself, not on a response', async () => {
    const sandbox = makeFakeSandbox()
    await new SandboxTestSessionRunner(() => sandbox).start(bundle, target())
    expect(sandbox.waitedForPort).toEqual([{ port: 8787, mode: 'tcp' }])
  })

  it('fails the start when the port never opens, and reports the log tail', async () => {
    // With nothing listening the SDK returns 503 rather than throwing, so a
    // response check would have called this a healthy start.
    const sandbox = makeFakeSandbox({
      portNeverOpens: true,
      logs: { stderr: 'Error: no such binding\n' },
    })
    const runner = new SandboxTestSessionRunner(() => sandbox, { readyTimeoutMs: 2_000 })
    await expect(runner.start(bundle, target())).rejects.toThrow(/no such binding/)
  })

  it('disposes the container when the start fails', async () => {
    // Otherwise it runs and bills until the reaper notices, minutes later.
    const sandbox = makeFakeSandbox({ portNeverOpens: true })
    const runner = new SandboxTestSessionRunner(() => sandbox, { readyTimeoutMs: 1_000 })
    await expect(runner.start(bundle, target())).rejects.toThrow()
    expect(sandbox.destroyed).toBe(1)
  })

  it('proxies a trigger into the container instead of exposing a public URL', async () => {
    const sandbox = makeFakeSandbox()
    const runner = new SandboxTestSessionRunner(() => sandbox)
    const handle = { sessionId: 's', containerId: 'test-s', processId: 'p', port: 8787 }

    const result = await runner.trigger(handle, { email: 'a@b.c' })

    const call = sandbox.fetchCalls.at(-1)!
    expect(call.url).toBe('http://localhost:8787/')
    expect(call.init.method).toBe('POST')
    expect(call.init.body).toBe('{"email":"a@b.c"}')
    expect(call.port).toBe(8787)
    expect(result).toEqual({ status: 200, body: { instanceId: 'inst-1' } })
  })

  it('reads one instance by id', async () => {
    const sandbox = makeFakeSandbox()
    const runner = new SandboxTestSessionRunner(() => sandbox)
    await runner.instanceStatus(
      { sessionId: 's', containerId: 'test-s', processId: 'p', port: 8787 },
      'inst/1',
    )
    expect(sandbox.fetchCalls.at(-1)!.url).toBe('http://localhost:8787/?instanceId=inst%2F1')
  })

  it('pages the process logs', async () => {
    const sandbox = makeFakeSandbox({ logs: { stdout: 'one\ntwo\n' } })
    const runner = new SandboxTestSessionRunner(() => sandbox)
    const handle = { sessionId: 's', containerId: 'test-s', processId: 'p', port: 8787 }

    const first = await runner.logs(handle)
    expect(first.entries.map((e) => e.text)).toEqual(['one', 'two'])
    expect((await runner.logs(handle, first.cursor)).entries).toEqual([])
  })

  it('does not lose stdout or repeat stderr as the buffers grow', async () => {
    // wrangler writes warnings to stderr in almost every session, so a
    // single combined count resends them every time stdout advances.
    const logs = { stdout: 'one\n', stderr: 'warn\n' }
    const sandbox = makeFakeSandbox({ logs })
    const runner = new SandboxTestSessionRunner(() => sandbox)
    const handle = { sessionId: 's', containerId: 'test-s', processId: 'p', port: 8787 }

    const first = await runner.logs(handle)
    expect(first.entries.map((e) => e.text)).toEqual(['one', 'warn'])

    logs.stdout = 'one\ntwo\n'
    const second = await runner.logs(handle, first.cursor)
    expect(second.entries.map((e) => e.text)).toEqual(['two'])
  })

  it('disposes the container, including one that never started', async () => {
    const sandbox = makeFakeSandbox()
    const runner = new SandboxTestSessionRunner(() => sandbox)
    // No process or port: what the reaper has for a reservation that never
    // reported back.
    await runner.stop({ sessionId: 's', containerId: 'test-s' })
    expect(sandbox.destroyed).toBe(1)
  })

  it('never lets a failed disposal escape', async () => {
    const runner = new SandboxTestSessionRunner(() => ({
      async destroy() {
        throw new Error('already gone')
      },
    }))
    await expect(runner.stop({ sessionId: 's', containerId: 'test-s' })).resolves.toBeUndefined()
  })
})
