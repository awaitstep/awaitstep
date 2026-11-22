import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceExistsError, RunGoneError } from '@awaitstep/codegen'
import { CloudflareWorkflowsAdapter } from '../adapter.js'

// Starting a run under a chosen id, and sending an event, through
// Cloudflare's REST API: what a run from AwaitStep does when the workflow has
// no URL of its own.

const config = {
  provider: 'cloudflare',
  credentials: { accountId: 'acct', apiToken: 'tok' },
  options: { workflowName: 'orders' },
}

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sent(fetchMock: ReturnType<typeof answer>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init }
}

afterEach(() => vi.unstubAllGlobals())

describe('trigger with an instance id', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  it('asks Cloudflare for that id, as instance_id', async () => {
    const fetchMock = answer(200, { success: true, result: { id: 'order-42' } })
    await expect(
      adapter.trigger('wf', { orderId: 42 }, config, { instanceId: 'order-42' }),
    ).resolves.toEqual({ instanceId: 'order-42' })
    const body = JSON.parse(sent(fetchMock).init.body as string)
    expect(body.instance_id).toBe('order-42')
    expect(body).not.toHaveProperty('id')
    expect(body.params).toEqual({ orderId: 42 })
  })

  it('throws InstanceExistsError for an id Cloudflare already has', async () => {
    answer(409, {
      success: false,
      errors: [{ code: 10405, message: 'workflows.api.error.instance.already_exists' }],
    })
    await expect(
      adapter.trigger('wf', {}, config, { instanceId: 'order-42' }),
    ).rejects.toBeInstanceOf(InstanceExistsError)
  })
})

describe('sendEvent', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  it('POSTs the payload to the instance’s events endpoint for that type', async () => {
    const fetchMock = answer(200, { success: true, result: null })
    await adapter.sendEvent({
      instanceId: 'order-42',
      type: 'sunny',
      payload: { hello: 1 },
      config,
    })
    const { url, init } = sent(fetchMock)
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct/workflows/orders/instances/order-42/events/sunny',
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ hello: 1 })
  })

  it('sends null when there is no payload', async () => {
    const fetchMock = answer(200, { success: true, result: null })
    await adapter.sendEvent({ instanceId: 'order-42', type: 'sunny', payload: undefined, config })
    expect(sent(fetchMock).init.body).toBe('null')
  })

  it('throws RunGoneError for an instance Cloudflare doesn’t have', async () => {
    answer(404, {
      success: false,
      errors: [{ code: 10101, message: 'workflows.api.error.instance.not_found' }],
    })
    await expect(
      adapter.sendEvent({ instanceId: 'nope', type: 'sunny', payload: {}, config }),
    ).rejects.toBeInstanceOf(RunGoneError)
  })

  it('refuses an event type Cloudflare wouldn’t take, without calling it', async () => {
    const fetchMock = answer(200, { success: true, result: null })
    await expect(
      adapter.sendEvent({ instanceId: 'order-42', type: 'a.b', payload: {}, config }),
    ).rejects.toThrow('Invalid type')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('hasInstance', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  it('is true for an instance Cloudflare has, false for one it says is not found', async () => {
    answer(200, { success: true, result: { id: 'order-42', status: 'running' } })
    await expect(adapter.hasInstance('order-42', config)).resolves.toBe(true)
    answer(404, {
      success: false,
      errors: [{ code: 10101, message: 'workflows.api.error.instance.not_found' }],
    })
    await expect(adapter.hasInstance('nope', config)).resolves.toBe(false)
  })

  it('throws for any other refusal: it is not proof there is none', async () => {
    answer(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] })
    await expect(adapter.hasInstance('order-42', config)).rejects.toThrow('Authentication error')
  })
})
