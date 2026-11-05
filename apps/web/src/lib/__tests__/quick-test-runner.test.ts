import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runQuickTest } from '../ide/quick-test-runner'

/**
 * Stands in for the sandbox (the null-origin iframe + worker). Nothing is
 * executed — what is under test is the conversation: that the step is
 * actually asked to run, that answers are collected, and that the sandbox is
 * always torn down. The sandbox's own security property (the iframe's
 * sandbox attribute) has its own test file.
 */
const harness = vi.hoisted(() => {
  interface Callbacks {
    onMessage(data: unknown): void
    onLoadError(message: string): void
    onUnavailable(message: string): void
    onStarted(): void
  }

  class FakeSandbox {
    static instances: FakeSandbox[] = []
    /** What a test wants the sandbox to do when the job arrives. */
    static onStart: ((sandbox: FakeSandbox, args: unknown) => void) | null = null
    /** Runs at creation — before the runner ever calls start. */
    static onCreate: ((sandbox: FakeSandbox) => void) | null = null
    /** Makes creation itself throw, as a blocked browser would. */
    static throwOnCreate: string | null = null

    readonly started: unknown[] = []
    destroyed = false

    constructor(
      readonly workerSource: string,
      readonly callbacks: Callbacks,
    ) {
      if (FakeSandbox.throwOnCreate) throw new Error(FakeSandbox.throwOnCreate)
      FakeSandbox.instances.push(this)
      FakeSandbox.onCreate?.(this)
    }

    start(args: unknown) {
      this.started.push(args)
      this.callbacks.onStarted()
      FakeSandbox.onStart?.(this, args)
    }

    destroy() {
      this.destroyed = true
    }

    reply(message: unknown) {
      this.callbacks.onMessage(message)
    }
  }

  return { FakeSandbox }
})

const { FakeSandbox } = harness

vi.mock('../ide/quick-test-sandbox', () => ({
  createQuickTestSandbox: (
    workerSource: string,
    callbacks: ConstructorParameters<typeof harness.FakeSandbox>[1],
  ) => new harness.FakeSandbox(workerSource, callbacks),
}))

const ARGS = { env: { API: 'x' }, event: { payload: {} }, inputs: { a: 1 } }
const SOURCE = 'export default async function a_step({ inputs }) {\n  return inputs.a;\n}\n'

beforeEach(() => {
  FakeSandbox.instances = []
  FakeSandbox.onStart = null
  FakeSandbox.onCreate = null
  FakeSandbox.throwOnCreate = null
})

function onlySandbox() {
  expect(FakeSandbox.instances).toHaveLength(1)
  return FakeSandbox.instances[0]!
}

describe('runQuickTest', () => {
  it('posts the arguments, which is what makes the step run at all', async () => {
    // The worker script only defines the step; it runs on a message. Without
    // this post every run sat until the timeout.
    FakeSandbox.onStart = (sandbox) => sandbox.reply({ type: 'done', result: '1' })

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(onlySandbox().started).toEqual([ARGS])
    expect(result.status).toBe('ok')
    expect(result.result).toBe('1')
  })

  it('hands the sandbox the full worker script, step bound and runnable', async () => {
    FakeSandbox.onStart = (sandbox) => sandbox.reply({ type: 'done', result: '1' })

    await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    const script = onlySandbox().workerSource
    expect(script).toContain('const __awaitstep_step = ')
    expect(script).not.toMatch(/^export\s/m)
  })

  it('collects logs in order, then the result', async () => {
    FakeSandbox.onStart = (sandbox) => {
      sandbox.reply({ type: 'log', level: 'info', text: 'first' })
      sandbox.reply({ type: 'log', level: 'error', text: 'second' })
      sandbox.reply({ type: 'done', result: '"done"' })
    }

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.logs).toEqual([
      { level: 'info', text: 'first' },
      { level: 'error', text: 'second' },
    ])
  })

  it('reports a thrown step as an error, keeping what it logged first', async () => {
    FakeSandbox.onStart = (sandbox) => {
      sandbox.reply({ type: 'log', level: 'log', text: 'got here' })
      sandbox.reply({ type: 'failed', message: 'x is not a function' })
    }

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('error')
    expect(result.error?.message).toBe('x is not a function')
    expect(result.logs).toHaveLength(1)
  })

  it('reports a script that could not load as never having run', async () => {
    // Not an 'error': the step did not throw, it was never reached. Calling
    // that "Threw" blames code that never ran. Before start, so the runner
    // can tell it apart from a step failing out of band.
    FakeSandbox.onCreate = (sandbox) => sandbox.callbacks.onLoadError('Unexpected token')

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toBe('Unexpected token')
  })

  it('reports a step that failed after starting as an error, logs kept', async () => {
    // An uncaught error in a timer or an unhandled rejection reaches the
    // worker's error event after the step began. "Never ran" would blame
    // code that plainly did — and drop what it logged.
    FakeSandbox.onStart = (sandbox) => {
      sandbox.reply({ type: 'log', level: 'log', text: 'before the crash' })
      sandbox.callbacks.onLoadError('boom in a timer')
    }

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('error')
    expect(result.error?.message).toBe('boom in a timer')
    expect(result.logs).toEqual([{ level: 'log', text: 'before the crash' }])
  })

  it('ignores messages a step posts on its own, instead of hanging or crashing', async () => {
    // User code can call self.postMessage with anything; only the shapes the
    // panel knows mean something.
    FakeSandbox.onStart = (sandbox) => {
      sandbox.reply(null)
      sandbox.reply('loose string')
      sandbox.reply({ type: 'mystery' })
      sandbox.reply({ type: 'done', result: '1' })
    }

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('ok')
    expect(result.result).toBe('1')
  })

  it('refuses cleanly when the sandbox cannot even be created', async () => {
    FakeSandbox.throwOnCreate = 'iframes are blocked here'

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: SOURCE,
      args: ARGS,
      timeoutMs: 5,
    })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toContain('iframes are blocked here')
  })

  it('refuses — never falls back — when the browser blocks the sandbox', async () => {
    // The opaque origin is the security boundary. A browser that cannot
    // provide it gets a refusal, not a same-origin run.
    FakeSandbox.onStart = (sandbox) => sandbox.callbacks.onUnavailable('workers disabled')

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toContain('sandbox')
    expect(onlySandbox().destroyed).toBe(true)
  })

  it('words the refusal as one sentence with the reason in parentheses', async () => {
    FakeSandbox.onStart = (sandbox) =>
      sandbox.callbacks.onUnavailable(
        'the sandbox didn’t boot; a content security policy may block it',
      )

    const result = await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

    expect(result.error?.message).toBe(
      'Quick test couldn’t start its sandbox in this browser (the sandbox didn’t boot; a content security policy may block it). Use a test session to run the whole workflow.',
    )
  })

  it('gives up on a step that never answers, and kills it', async () => {
    // The case this exists for is a `while (true)` in the body: the sandbox
    // has to go, or its worker keeps a core busy for the session.
    FakeSandbox.onStart = null

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: SOURCE,
      args: ARGS,
      timeoutMs: 5,
    })

    expect(result.status).toBe('timeout')
    expect(result.error?.message).toMatch(/didn’t finish/i)
    expect(onlySandbox().destroyed).toBe(true)
  })

  it('destroys the sandbox however the run ended', async () => {
    for (const reply of [
      (s: InstanceType<typeof FakeSandbox>) => s.reply({ type: 'done', result: '1' }),
      (s: InstanceType<typeof FakeSandbox>) => s.reply({ type: 'failed', message: 'nope' }),
    ]) {
      FakeSandbox.instances = []
      FakeSandbox.onStart = reply

      await runQuickTest({ path: 'nodes/a.ts', source: SOURCE, args: ARGS })

      expect(onlySandbox().destroyed).toBe(true)
    }
  })

  it('reports a compile error without ever starting a sandbox', async () => {
    const result = await runQuickTest({
      path: 'nodes/broken.ts',
      source: 'export default async function x( {\n',
      args: ARGS,
    })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toContain('nodes/broken.ts')
    expect(FakeSandbox.instances).toHaveLength(0)
  })

  it('refuses an import that survives transpiling, without starting a sandbox', async () => {
    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: `import { z } from 'zod'\nexport default async function a_step() {\n  return z;\n}\n`,
      args: ARGS,
    })

    expect(result.status).toBe('refused')
    expect(result.error?.message).toContain('zod')
    expect(FakeSandbox.instances).toHaveLength(0)
  })

  it('runs a module whose only import is a type', async () => {
    // The transpiler erases it, so there is nothing left to resolve — this
    // is the case that reading the source wrongly refused.
    FakeSandbox.onStart = (sandbox) => sandbox.reply({ type: 'done', result: '1' })

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source: `import type { User } from '#app/types'\nexport default async function a_step(): Promise<number> {\n  return 1;\n}\n`,
      args: ARGS,
    })

    expect(result.status).toBe('ok')
  })

  it('runs a module that exports a type alongside its default', async () => {
    FakeSandbox.onStart = (sandbox) => sandbox.reply({ type: 'done', result: '1' })

    const result = await runQuickTest({
      path: 'nodes/a.ts',
      source:
        'export type Out = number\nexport default async function a_step() {\n  return 1;\n}\n',
      args: ARGS,
    })

    expect(result.status).toBe('ok')
  })

  it('strips the types before the code reaches the sandbox', async () => {
    // Sucrase runs for real here: a step module is TypeScript, and a worker
    // handed `: string` would fail to parse.
    FakeSandbox.onStart = (sandbox) => sandbox.reply({ type: 'done', result: '""' })

    await runQuickTest({
      path: 'nodes/a.ts',
      source:
        'export default async function a_step({ inputs }: { inputs: { a: string } }) {\n  return inputs.a;\n}\n',
      args: ARGS,
    })

    expect(onlySandbox().workerSource).not.toContain(': string')
  })
})
