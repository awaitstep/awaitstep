import { describe, it, expect, vi, afterEach } from 'vitest'
import { CloudflareAPI } from '../api.js'
import { CloudflareApiError, goneFrom } from '../api-error.js'

describe('CloudflareAPI input validation', () => {
  const api = new CloudflareAPI({ accountId: 'test-account', apiToken: 'test-token' })

  it('rejects workflowName with path traversal', async () => {
    await expect(api.createInstance('../../evil')).rejects.toThrow('Invalid workflowName')
  })

  it('rejects instanceId with dots', async () => {
    await expect(api.getInstanceStatus('my-workflow', 'some.bad.id')).rejects.toThrow(
      'Invalid instanceId',
    )
  })

  it('rejects workflowName with slashes', async () => {
    await expect(api.getInstanceStatus('my/workflow', 'valid-id')).rejects.toThrow(
      'Invalid workflowName',
    )
  })

  it('rejects empty instanceId', async () => {
    await expect(api.getInstanceStatus('my-workflow', '')).rejects.toThrow('Invalid instanceId')
  })

  it('accepts valid alphanumeric-hyphen-underscore values', async () => {
    // This will fail with a network error (no real API), but should NOT
    // fail with a validation error — that's what we're testing
    const result = api.createInstance('my-workflow_v2', undefined, 'instance-123_abc')
    await expect(result).rejects.not.toThrow('Invalid')
  })

  it('validates accountId at construction time', () => {
    expect(() => new CloudflareAPI({ accountId: '../evil', apiToken: 'token' })).toThrow(
      'Invalid accountId',
    )
  })
})

describe('CloudflareAPI createInstance retention', () => {
  const api = new CloudflareAPI({ accountId: 'test-account', apiToken: 'test-token' })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetch() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { id: 'inst-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('sends instance_retention in snake_case when retention is provided', async () => {
    const fetchMock = stubFetch()
    await api.createInstance('my-workflow', { hello: 'world' }, undefined, {
      successRetention: '7 days',
      errorRetention: 86400000,
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.instance_retention).toEqual({
      success_retention: '7 days',
      error_retention: 86400000,
    })
    expect(body.params).toEqual({ hello: 'world' })
  })

  it('omits instance_retention when retention is not provided', async () => {
    const fetchMock = stubFetch()
    await api.createInstance('my-workflow', { hello: 'world' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.instance_retention).toBeUndefined()
  })

  it('omits unset retention fields', async () => {
    const fetchMock = stubFetch()
    await api.createInstance('my-workflow', undefined, undefined, { errorRetention: '30 days' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.instance_retention).toEqual({ error_retention: '30 days' })
  })
})

describe('CloudflareAPI refusals', () => {
  afterEach(() => vi.unstubAllGlobals())

  function answer(status: number, errors: Array<{ message: string; code?: number }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false, errors }), { status })),
    )
  }

  it('carries the status and Cloudflare’s code, with the message as before', async () => {
    answer(404, [{ message: 'workflows.api.error.workflow.not_found', code: 10200 }])
    const api = new CloudflareAPI({ accountId: 'acct', apiToken: 'tok' })
    const err = await api.getInstanceStatus('my-workflow', 'inst-1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CloudflareApiError)
    expect(err).toMatchObject({
      message: 'workflows.api.error.workflow.not_found',
      status: 404,
      code: 10200,
    })
  })

  it('reads a run as gone only from Cloudflare’s own not_found, on a 404', () => {
    expect(goneFrom(new CloudflareApiError('workflows.api.error.workflow.not_found', 404))).toBe(
      'workflow',
    )
    expect(goneFrom(new CloudflareApiError('workflows.api.error.instance.not_found', 404))).toBe(
      'instance',
    )
    // A 404 that isn't about the run (a wrong account id, a route), another status, another error.
    expect(goneFrom(new CloudflareApiError('Could not route to /accounts/x', 404))).toBeNull()
    expect(
      goneFrom(new CloudflareApiError('workflows.api.error.workflow.not_found', 500)),
    ).toBeNull()
    expect(goneFrom(new Error('workflows.api.error.workflow.not_found'))).toBeNull()
  })
})
