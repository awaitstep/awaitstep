import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInlineHost,
  createWorkflowContext,
  defineFunction,
  defineWorkflow,
  durableStep,
  type WorkflowHost,
} from '../runtime.js'
import { RUNTIME_MODULE_SOURCE } from '../runtime-source.js'

interface RecordingHost {
  host: WorkflowHost
  calls: string[]
}

function recordingHost(): RecordingHost {
  const calls: string[] = []
  const host: WorkflowHost = {
    do<T>(name: string, config: unknown, callback: (ctx: { attempt: number }) => T) {
      calls.push(`do:${name}:${config ? 'config' : 'plain'}`)
      return Promise.resolve(callback({ attempt: 2 }))
    },
    sleep(name: string, duration: number | string) {
      calls.push(`sleep:${name}:${String(duration)}`)
      return Promise.resolve()
    },
    sleepUntil(name: string, at: Date | number) {
      calls.push(`until:${name}:${at instanceof Date ? at.toISOString() : String(at)}`)
      return Promise.resolve()
    },
    waitForEvent<T>(name: string, options: { type: string }) {
      calls.push(`wait:${name}:${options.type}`)
      return Promise.resolve('event' as T)
    },
    startWorkflow(options) {
      calls.push(`start:${options.workflow}`)
      return Promise.resolve({ instanceId: 'child-1' })
    },
    workflowStatus(instanceId, options) {
      calls.push(`status:${instanceId}:${options.workflow}`)
      return Promise.resolve({ status: 'complete', output: { ok: true } })
    },
    callScript(options) {
      calls.push(`call:${options.script}:${options.method}`)
      return Promise.resolve({ ok: true })
    },
  }
  return { host, calls }
}

const env = { API_KEY: 'secret' }
const event = { payload: { id: 'run-1' }, timestamp: new Date(0), instanceId: 'instance-1' }

describe('defineWorkflow', () => {
  it('returns the definition unchanged', () => {
    const definition = defineWorkflow({
      id: 'lead-enrichment',
      run: async () => undefined,
    })
    expect(definition.id).toBe('lead-enrichment')
    expect(typeof definition.run).toBe('function')
  })
})

describe('defineFunction', () => {
  it('returns the definition unchanged', () => {
    const definition = defineFunction({
      id: 'webhook',
      fetch: () => new Response('ok'),
    })
    expect(definition.id).toBe('webhook')
    expect(typeof definition.fetch).toBe('function')
  })
})

describe('createWorkflowContext', () => {
  it('passes the environment and event through', () => {
    const { host } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    expect(flow.env).toBe(env)
    expect(flow.event).toBe(event)
  })

  it('runs a step without config and gives the callback the attempt', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    const seen: number[] = []
    const value = await flow.step('fetch-user', (ctx) => {
      seen.push(ctx.attempt)
      return 'user'
    })
    expect(value).toBe('user')
    expect(seen).toEqual([2])
    expect(calls).toEqual(['do:fetch-user:plain'])
  })

  it('runs a step with config', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    const value = await flow.step('fetch-user', { timeout: '10 seconds' }, async () => 42)
    expect(value).toBe(42)
    expect(calls).toEqual(['do:fetch-user:config'])
  })

  it('refuses a step without a callback', async () => {
    const { host } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    await expect(flow.step('broken', undefined as never)).rejects.toThrow(
      'Workflow step "broken" was called without a callback',
    )
  })

  it('delegates sleep', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    await flow.sleep('pause', '5 seconds')
    expect(calls).toEqual(['sleep:pause:5 seconds'])
  })

  it('normalizes a string sleepUntil to a Date', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    await flow.sleepUntil('resume', '2026-01-02T03:04:05.000Z')
    expect(calls).toEqual(['until:resume:2026-01-02T03:04:05.000Z'])
  })

  it('passes a Date and a number sleepUntil through unchanged', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    await flow.sleepUntil('date', new Date(0))
    await flow.sleepUntil('number', 1000)
    expect(calls).toEqual(['until:date:1970-01-01T00:00:00.000Z', 'until:number:1000'])
  })

  it('refuses an invalid sleepUntil date', async () => {
    const { host } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    await expect(flow.sleepUntil('bad', 'not a date')).rejects.toThrow(
      'Workflow sleep "bad" has an invalid date: "not a date"',
    )
  })

  it('delegates waitForEvent', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    const value = await flow.waitForEvent('approval', { type: 'lead.approved' })
    expect(value).toBe('event')
    expect(calls).toEqual(['wait:approval:lead.approved'])
  })

  it('delegates platform calls to the host', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    await expect(flow.startWorkflow({ workflow: 'child' })).resolves.toEqual({
      instanceId: 'child-1',
    })
    await expect(
      flow.workflowStatus('child-1', { workflow: 'child', params: { cf: { binding: 'CHILD' } } }),
    ).resolves.toMatchObject({ status: 'complete' })
    await expect(
      flow.callScript({ script: 'pricing', method: 'GET', params: { cf: { binding: 'PRICING' } } }),
    ).resolves.toEqual({ ok: true })
    expect(calls).toEqual(['start:child', 'status:child-1:child', 'call:pricing:GET'])
  })
})

describe('durableStep', () => {
  it('maps do without config', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    const step = durableStep(flow)
    const value = await step.do('a', () => 1)
    expect(value).toBe(1)
    expect(calls).toEqual(['do:a:plain'])
  })

  it('maps do with config', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    const step = durableStep(flow)
    await step.do('b', { retries: { limit: 2, delay: '1 second' } }, () => 2)
    expect(calls).toEqual(['do:b:config'])
  })

  it('maps the durable waits', async () => {
    const { host, calls } = recordingHost()
    const flow = createWorkflowContext({ env, event, host })
    const step = durableStep(flow)
    await step.sleep('s', '1 second')
    await step.sleepUntil('u', 5)
    await step.waitForEvent('w', { type: 'thing.happened' })
    expect(calls).toEqual(['sleep:s:1 second', 'until:u:5', 'wait:w:thing.happened'])
  })
})

describe('emitted runtime source', () => {
  it('is the authoring surface, so the bundle and the package cannot drift', async () => {
    const source = await readFile(new URL('../runtime.ts', import.meta.url), 'utf8')
    expect(RUNTIME_MODULE_SOURCE).toBe(source)
  })

  it('has no imports, so it can be emitted into a bundle as-is', () => {
    expect(RUNTIME_MODULE_SOURCE).not.toMatch(/^\s*import\b/m)
    expect(RUNTIME_MODULE_SOURCE).not.toMatch(/\brequire\s*\(/)
  })
})

describe('createInlineHost platform calls', () => {
  it('rejects a platform call without an adapter', async () => {
    const host = createInlineHost()
    await expect(host.startWorkflow({ workflow: 'child' })).rejects.toThrow(
      'startWorkflow is not available in a function',
    )
    await expect(host.callScript({ script: 'pricing' })).rejects.toThrow(
      'callScript is not available in a function',
    )
  })

  it('delegates to the supplied platform', async () => {
    const host = createInlineHost({
      startWorkflow: () => Promise.resolve({ instanceId: 'child-1' }),
      workflowStatus: () => Promise.resolve({ status: 'complete', output: 'ok' }),
      callScript: () => Promise.resolve({ price: 1 }),
    })
    await expect(host.startWorkflow({ workflow: 'child' })).resolves.toEqual({
      instanceId: 'child-1',
    })
    await expect(host.callScript({ script: 'pricing' })).resolves.toEqual({ price: 1 })
  })
})

describe('createInlineHost', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const delays = () =>
    vi
      .mocked(setTimeout)
      .mock.calls.map((call) => call[1])
      .filter((ms): ms is number => typeof ms === 'number')

  it('runs the body once, as attempt 1, and answers its value', async () => {
    const host = createInlineHost()
    await expect(host.do('s', undefined, (ctx) => ctx.attempt * 10)).resolves.toBe(10)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retry unless the node asks: one attempt, its error', async () => {
    const host = createInlineHost()
    let calls = 0
    await expect(
      host.do('s', undefined, () => {
        calls++
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(calls).toBe(1)
  })

  it('retries with the configured delay and backoff, numbering the attempts', async () => {
    vi.spyOn(globalThis, 'setTimeout')
    const host = createInlineHost()
    const seen: number[] = []
    // `limit` counts retries (Cloudflare's meaning): 2 retries, 3 attempts.
    const result = host.do(
      's',
      { retries: { limit: 2, delay: '100 milliseconds', backoff: 'exponential' } },
      (ctx) => {
        seen.push(ctx.attempt)
        if (ctx.attempt < 3) throw new Error(`fail ${ctx.attempt}`)
        return 'ok'
      },
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(seen).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(200)
    await expect(result).resolves.toBe('ok')
    expect(seen).toEqual([1, 2, 3])
    expect(delays()).toEqual([100, 200])
  })

  it('waits delay × attempt with linear backoff, and a flat delay by default', async () => {
    vi.spyOn(globalThis, 'setTimeout')
    const host = createInlineHost()
    const failing = () => {
      throw new Error('no')
    }
    // The expectation is attached before the clock moves, so the rejection
    // is never unhandled while the timers run.
    const linear = expect(
      host.do('s', { retries: { limit: 2, delay: 50, backoff: 'linear' } }, failing),
    ).rejects.toThrow('no')
    await vi.advanceTimersByTimeAsync(150)
    await linear
    expect(delays()).toEqual([50, 100])

    vi.mocked(setTimeout).mockClear()
    const flat = expect(
      host.do('s', { retries: { limit: 2, delay: '1 second' } }, failing),
    ).rejects.toThrow('no')
    await vi.advanceTimersByTimeAsync(2000)
    await flat
    expect(delays()).toEqual([1000, 1000])
  })

  it('gives up after the last attempt with that attempt’s error: limit 1 is two attempts', async () => {
    const host = createInlineHost()
    const result = expect(
      host.do('s', { retries: { limit: 1, delay: 10 } }, (ctx) => {
        throw new Error(`fail ${ctx.attempt}`)
      }),
    ).rejects.toThrow('fail 2')
    await vi.advanceTimersByTimeAsync(10)
    await result
  })

  it('reads a retry delay it cannot parse before the first attempt, so the body never runs', async () => {
    const host = createInlineHost()
    let calls = 0
    await expect(
      host.do('s', { retries: { limit: 1, delay: 'later' } }, () => {
        calls++
        return 1
      }),
    ).rejects.toThrow('Step "s": unrecognised duration "later"')
    expect(calls).toBe(0)
  })

  it('retries after a timed-out attempt, which is abandoned rather than aborted', async () => {
    const host = createInlineHost()
    let calls = 0
    const result = host.do('s', { timeout: 50, retries: { limit: 1, delay: 10 } }, (ctx) => {
      calls++
      return ctx.attempt === 1 ? new Promise<string>(() => {}) : 'second'
    })
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(10)
    await expect(result).resolves.toBe('second')
    expect(calls).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out an attempt, naming the step, and clears its timer', async () => {
    const host = createInlineHost()
    const result = expect(
      host.do('slow one', { timeout: '50 milliseconds' }, () => new Promise(() => {})),
    ).rejects.toThrow('Step "slow one" timed out after 50 ms')
    await vi.advanceTimersByTimeAsync(50)
    await result
    expect(vi.getTimerCount()).toBe(0)
    const quick = host.do('quick', { timeout: 50 }, () => 'done')
    await expect(quick).resolves.toBe('done')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refuses a duration it cannot read, naming the step', async () => {
    const host = createInlineHost()
    await expect(host.do('s', { timeout: 'soon' }, () => 1)).rejects.toThrow(
      'Step "s": unrecognised duration "soon"',
    )
  })

  it('rejects the durable waits: a function has no runtime to park in', async () => {
    const host = createInlineHost()
    await expect(host.sleep('nap', '1 minute')).rejects.toThrow(
      'Step "nap": sleep is not available in a function',
    )
    await expect(host.sleepUntil('until', Date.now())).rejects.toThrow(
      'sleepUntil is not available',
    )
    await expect(host.waitForEvent('wait', { type: 'x' })).rejects.toThrow(
      'waitForEvent is not available',
    )
  })

  it('serves step.do end to end through the context and the step adapter', async () => {
    const flow = createWorkflowContext({
      env: { API_KEY: 'k' },
      event: {
        payload: { n: 2 },
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        instanceId: 'i-1',
      },
      host: createInlineHost(),
    })
    const step = durableStep(flow)
    await expect(step.do('double', (ctx) => ctx.attempt + flow.event.payload.n)).resolves.toBe(3)
    await expect(step.do('cfg', { retries: { limit: 0, delay: 1 } }, () => 'v')).resolves.toBe('v')
  })

  it('caps attempts at ten and every wait at thirty seconds, whatever the node asks', async () => {
    vi.spyOn(globalThis, 'setTimeout')
    const host = createInlineHost()
    let calls = 0
    const result = expect(
      host.do('s', { retries: { limit: 100, delay: '52 weeks' }, timeout: '1 hour' }, () => {
        calls++
        throw new Error('no')
      }),
    ).rejects.toThrow('no')
    await vi.advanceTimersByTimeAsync(30_000 * 9)
    await result
    expect(calls).toBe(10)
    // Nine backoff pauses of 30 s; the per-attempt timeout timers are 30 s too.
    expect(delays().filter((ms) => ms === 30_000).length).toBeGreaterThanOrEqual(9)
    expect(delays().every((ms) => ms <= 30_000)).toBe(true)
  })

  it('ships in the runtime module every bundle carries', async () => {
    expect(RUNTIME_MODULE_SOURCE).toContain('export function createInlineHost')
  })
})
