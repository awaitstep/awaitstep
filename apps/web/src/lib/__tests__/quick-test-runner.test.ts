import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runQuickTest } from '../ide/quick-test-runner'

/**
 * Stands in for the browser's Worker. Scripts are never executed — what is
 * under test is the conversation: that the step is actually asked to run,
 * that answers are collected, and that the worker is always torn down.
 */
class FakeWorker {
  static instances: FakeWorker[] = []
  /** What a test wants the worker to do when the job arrives. */
  static onPost: ((worker: FakeWorker, data: unknown) => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  readonly posted: unknown[] = []
  terminated = false

  constructor(readonly url: string) {
    FakeWorker.instances.push(this)
  }

  postMessage(data: unknown) {
    this.posted.push(data)
    FakeWorker.onPost?.(this, data)
  }

  terminate() {
    this.terminated = true
  }

  reply(message: unknown) {
    this.onmessage?.({ data: message })
  }
}

const ARGS = { env: { API: 'x' }, event: { payload: {} }, inputs: { a: 1 } }
const SOURCE = 'export default async function a_step({ inputs }) {\n  return inputs.a;\n}\n'

const revoked: string[] = []
// Replaced individually, not by stubbing the whole URL global: spreading the
// class drops its constructor, and the transpiler builds `new URL(...)`.
const realCreateObjectURL = URL.createObjectURL
const realRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  FakeWorker.instances = []
  FakeWorker.onPost = null
  revoked.length = 0
  vi.stubGlobal('Worker', FakeWorker)
  URL.createObjectURL = () => 'blob:quick-test'
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  URL.createObjectURL = realCreateObjectURL
  URL.revokeObjectURL = realRevokeObjectURL
})

function onlyWorker(): FakeWorker {
  expect(FakeWorker.instances).toHaveLength(1)
  return FakeWorker.instances[0]!
}

describe('runQuickTest', () => {
  it('posts the arguments, which is what makes the step run at all', async () => {
    // The worker script only defines the step; it runs on a message. Without
    // this post every run sat until the timeout.
    FakeWorker.onPost = (worker) => worker.reply({ type: 'done', result: '1' })

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(onlyWorker().posted).toEqual([ARGS])
    expect(result.status).toBe('ok')
    expect(result.result).toBe('1')
  })

  it('collects logs in order, then the result', async () => {
    FakeWorker.onPost = (worker) => {
      worker.reply({ type: 'log', level: 'info', text: 'first' })
      worker.reply({ type: 'log', level: 'error', text: 'second' })
      worker.reply({ type: 'done', result: '"done"' })
    }

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.logs).toEqual([
      { level: 'info', text: 'first' },
      { level: 'error', text: 'second' },
    ])
  })

  it('reports a thrown step as an error, keeping what it logged first', async () => {
    FakeWorker.onPost = (worker) => {
      worker.reply({ type: 'log', level: 'log', text: 'got here' })
      worker.reply({ type: 'failed', message: 'x is not a function' })
    }

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('error')
    expect(result.error?.message).toBe('x is not a function')
    expect(result.logs).toHaveLength(1)
  })

  it('reports a script that could not load as never having run', async () => {
    // Not an 'error': the step did not throw, it was never reached. Calling
    // that "Threw" blames code that never ran.
    FakeWorker.onPost = (worker) => worker.onerror?.({ message: 'Unexpected token' })

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toBe('Unexpected token')
  })

  it('gives up on a step that never answers, and kills it', async () => {
    // The case this exists for is a `while (true)` in the body: the worker
    // has to be terminated or it keeps a core busy for the session.
    FakeWorker.onPost = null

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: SOURCE,
      args: ARGS,
      timeoutMs: 5,
    })

    expect(result.status).toBe('timeout')
    expect(result.error?.message).toMatch(/did not finish/i)
    expect(onlyWorker().terminated).toBe(true)
  })

  it('terminates the worker and releases the blob however it ended', async () => {
    for (const reply of [
      (w: FakeWorker) => w.reply({ type: 'done', result: '1' }),
      (w: FakeWorker) => w.reply({ type: 'failed', message: 'nope' }),
    ]) {
      FakeWorker.instances = []
      revoked.length = 0
      FakeWorker.onPost = reply

      await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

      expect(onlyWorker().terminated).toBe(true)
      expect(revoked).toEqual(['blob:quick-test'])
    }
  })

  it('reports a compile error without ever starting a worker', async () => {
    const result = await runQuickTest({
      path: 'nodes/broken.ts',
      source: 'export default async function x( {\n',
      args: ARGS,
    })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toContain('nodes/broken.ts')
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('refuses an import that survives transpiling, without starting a worker', async () => {
    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: `import { z } from 'zod'\nexport default async function a_step() {\n  return z;\n}\n`,
      args: ARGS,
    })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toContain('zod')
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('runs a module whose only import is a type', async () => {
    // The transpiler erases it, so there is nothing left to resolve — this
    // is the case that reading the source wrongly refused.
    FakeWorker.onPost = (worker) => worker.reply({ type: 'done', result: '1' })

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: `import type { User } from '#app/types'\nexport default async function a_step(): Promise<number> {\n  return 1;\n}\n`,
      args: ARGS,
    })

    expect(result.status).toBe('ok')
  })

  it('runs a module that exports a type alongside its default', async () => {
    FakeWorker.onPost = (worker) => worker.reply({ type: 'done', result: '1' })

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source:
        'export type Out = number\nexport default async function a_step() {\n  return 1;\n}\n',
      args: ARGS,
    })

    expect(result.status).toBe('ok')
  })

  it('strips the types before the code reaches the worker', async () => {
    // Sucrase runs for real here: a step module is TypeScript, and a worker
    // handed `: string` would fail to parse.
    FakeWorker.onPost = (worker) => worker.reply({ type: 'done', result: '""' })

    await runQuickTest({
      path: 'nodes/a.ts',
      source:
        'export default async function a_step({ inputs }: { inputs: { a: string } }) {\n  return inputs.a;\n}\n',
      args: ARGS,
    })

    expect(FakeWorker.instances).toHaveLength(1)
  })
})
