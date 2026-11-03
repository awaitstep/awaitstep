import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
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
