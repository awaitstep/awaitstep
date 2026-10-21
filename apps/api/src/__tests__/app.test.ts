import { describe, it, expect, beforeEach } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { MAX_REQUEST_BYTES } from '../lib/request-limits.js'
import { createTestApp, resetStore, TEST_PROJECT_ID } from './helpers.js'

describe('app', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  it('responds to health check without auth', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('returns 404 for nonexistent workflow', async () => {
    const res = await app.request(`/api/workflows/nonexistent?projectId=${TEST_PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'fail' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when projectId is missing on project-scoped routes', async () => {
    const res = await app.request('/api/workflows', {
      method: 'GET',
    })
    expect(res.status).toBe(400)
  })

  it('answers a middleware refusal in JSON, with its own status', async () => {
    // CSRF throws an HTTPException with a plain-text body. Returned as-is
    // a client parsing JSON chokes; mapped to a 500 it reads as a server
    // fault. Neither is what happened.
    const guarded = createTestApp({ corsOrigin: 'https://app.example.com' })
    const res = await guarded.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      method: 'POST',
      headers: {
        // A form-submittable content type is what CSRF guards; JSON is
        // exempt because a form cannot send it cross-origin.
        'Content-Type': 'text/plain',
        Cookie: 'session=whatever',
        Origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json()).error).toBeTruthy()
  })

  it('keeps the headers a refusal carries', async () => {
    // Some refusals are only actionable because of a header —
    // `WWW-Authenticate`, `Retry-After`. Rebuilding the response from the
    // message and status alone throws those away.
    const guarded = createTestApp()
    guarded.get('/api/__header-test', () => {
      throw new HTTPException(429, {
        res: new Response('slow down', {
          status: 429,
          headers: { 'Retry-After': '30' },
        }),
      })
    })
    const res = await guarded.request('/api/__header-test')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('passes a JSON refusal through untouched', async () => {
    const guarded = createTestApp()
    guarded.get('/api/__json-test', () => {
      throw new HTTPException(402, {
        res: Response.json({ error: 'payment required', invoice: 'inv_1' }, { status: 402 }),
      })
    })
    const res = await guarded.request('/api/__json-test')
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: 'payment required', invoice: 'inv_1' })
  })

  it('refuses an oversized body with 413 and a JSON reason', async () => {
    // The body limit throws an HTTPException. Reported as a 500 it reads as
    // a server fault, and the plain-text default body cannot be parsed by a
    // client that only speaks JSON.
    const res = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(MAX_REQUEST_BYTES) }),
    })
    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain(String(MAX_REQUEST_BYTES))
  })
})
