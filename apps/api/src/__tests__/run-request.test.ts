import { describe, expect, it } from 'vitest'
import { BAD_INSTANCE_ID, namedInstanceId, sendEventBody } from '@awaitstep/codegen'
import { withFreshInstanceId, withQuery } from '../lib/run-request.js'
import { isPrivateAddress, publicFetch } from '../entry/public-fetch.js'

describe('namedInstanceId', () => {
  it('reads the body’s instanceId, or none', () => {
    expect(namedInstanceId({ instanceId: 'order-42', a: 1 })).toEqual({
      ok: true,
      instanceId: 'order-42',
    })
    expect(namedInstanceId({ a: 1 })).toEqual({ ok: true, instanceId: null })
    expect(namedInstanceId(undefined)).toEqual({ ok: true, instanceId: null })
    expect(namedInstanceId([1])).toEqual({ ok: true, instanceId: null })
  })

  it.each(['a.b', '-leading', '', 'x'.repeat(101), 42])('refuses %s', (instanceId) => {
    expect(namedInstanceId({ instanceId })).toEqual({ ok: false, error: BAD_INSTANCE_ID })
  })
})

describe('withFreshInstanceId', () => {
  it('replaces a named id and keeps the rest', () => {
    const fresh = withFreshInstanceId({ instanceId: 'order-42', n: 1 }) as Record<string, unknown>
    expect(fresh.n).toBe(1)
    expect(fresh.instanceId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps a send-event body’s id: it names the run it resumes', () => {
    const event = { action: 'send-event', instanceId: 'order-42', type: 'sunny' }
    expect(withFreshInstanceId(event)).toBe(event)
  })

  it('leaves params without one as they are', () => {
    const params = { n: 1 }
    expect(withFreshInstanceId(params)).toBe(params)
    expect(withFreshInstanceId(undefined)).toBeUndefined()
  })
})

describe('sendEventBody', () => {
  it('is null for any other body', () => {
    expect(sendEventBody({ a: 1 })).toBeNull()
    expect(sendEventBody(undefined)).toBeNull()
  })

  it('reads payload, or params as the worker’s route does', () => {
    expect(
      sendEventBody({ action: 'send-event', instanceId: 'r', type: 'sunny', payload: 1 }),
    ).toEqual({ ok: true, instanceId: 'r', type: 'sunny', payload: 1 })
    expect(
      sendEventBody({ action: 'send-event', instanceId: 'r', type: 'sunny', params: 2 }),
    ).toMatchObject({ payload: 2 })
  })
})

describe('sendEventBody in its query form', () => {
  it('reads instanceId and type from the query, the body as the payload', () => {
    const query = new URLSearchParams('action=send-event&instanceId=r&type=sunny')
    expect(sendEventBody({ temp: 24 }, query)).toEqual({
      ok: true,
      instanceId: 'r',
      type: 'sunny',
      payload: { temp: 24 },
    })
  })
})

describe('withQuery', () => {
  it('adds the caller’s query to the URL’s own', () => {
    expect(withQuery('https://wf.acme.com/v1/', 'a=1&b=2')).toBe('https://wf.acme.com/v1/?a=1&b=2')
    expect(withQuery('https://wf.acme.com/v1/?k=x', 'a=1')).toBe('https://wf.acme.com/v1/?k=x&a=1')
    expect(withQuery('https://wf.acme.com/v1/', undefined)).toBe('https://wf.acme.com/v1/')
  })
})

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    '::127.0.0.1',
    '64:ff9b:1::a00:1',
    '2001:0:4136:e378::1',
    '2002:7f00:1::1',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['104.16.132.229', '1.1.1.1', '2606:4700::6810:84e5', '::ffff:1.1.1.1'])(
    'lets %s through',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    },
  )
})

describe('publicFetch', () => {
  it('refuses, when it connects, a name that resolves to a private address', async () => {
    const failure = await publicFetch('http://localhost:8080/').catch((error: unknown) => error)
    expect((failure as Error & { cause?: Error }).cause?.name).toBe('PrivateAddressError')
  })
})
