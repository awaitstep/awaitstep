import { describe, it, expect, beforeEach } from 'vitest'
import { CROSS_ORIGIN_REFUSED } from '../middleware/origin-check.js'
import { createTestApp, resetStore, TEST_PROJECT_ID } from './helpers.js'

const APP = 'https://app.example.com'
const OTHER = 'https://evil.example.com'

describe('cross-origin write check', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp({ corsOrigin: APP })
  })

  const createWorkflow = (headers: Record<string, string>, method = 'POST') =>
    app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: 'session=whatever', ...headers },
      ...(method === 'GET' ? {} : { body: JSON.stringify({ name: 'From somewhere' }) }),
    })

  it('refuses a cross-site JSON write that carries a cookie', async () => {
    // csrf() let this through: JSON is not a content type a form can send.
    const res = await createWorkflow({ Origin: OTHER, 'Sec-Fetch-Site': 'cross-site' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: CROSS_ORIGIN_REFUSED })
  })

  it('refuses it on its Origin alone, and for every write method', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await createWorkflow({ Origin: OTHER }, method)
      expect(res.status, method).toBe(403)
    }
  })

  it('refuses an Origin of null (a sandboxed frame, a redirect)', async () => {
    expect((await createWorkflow({ Origin: 'null' })).status).toBe(403)
  })

  it('refuses a same-site page that is not one of the app’s origins', async () => {
    const res = await createWorkflow({
      Origin: 'https://other.example.com',
      'Sec-Fetch-Site': 'same-site',
    })
    expect(res.status).toBe(403)
  })

  it('lets the app’s own origin write', async () => {
    const res = await createWorkflow({ Origin: APP, 'Sec-Fetch-Site': 'same-site' })
    expect(res.status).toBe(201)
  })

  it('lets a page on the API’s own origin write over plain HTTP, where there is no Sec-Fetch-Site', async () => {
    // A self-host opened at a LAN address its CORS_ORIGIN does not name: the
    // request is still same-origin, and its Origin says so.
    const res = await createWorkflow({ Origin: 'http://localhost' })
    expect(res.status).toBe(201)
  })

  it('refuses a same-site page whose Origin only matches the API’s URL', async () => {
    // Behind a proxy that ends TLS the URL here is http://; an http page
    // injected on the same host sends that Origin, with Sec-Fetch-Site.
    const res = await createWorkflow({ Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-site' })
    expect(res.status).toBe(403)
  })

  it('lets a same-origin or user-typed request write', async () => {
    expect((await createWorkflow({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(201)
    expect((await createWorkflow({ 'Sec-Fetch-Site': 'none' })).status).toBe(201)
  })

  it('lets a client that is not a browser write (no Origin, no Sec-Fetch-Site)', async () => {
    expect((await createWorkflow({})).status).toBe(201)
  })

  it('does not check a request signed in with a key, or one without a cookie', async () => {
    const keyed = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      method: 'POST',
      headers: { Origin: OTHER, Authorization: 'Bearer as_unknown', Cookie: 'session=whatever' },
      body: '{}',
    })
    // The key is unknown, so auth refuses it — not the origin check.
    expect(keyed.status).toBe(401)

    const cookieless = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      method: 'POST',
      headers: { Origin: OTHER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(cookieless.status).not.toBe(403)
  })

  it('does not check reads', async () => {
    const res = await createWorkflow({ Origin: OTHER, 'Sec-Fetch-Site': 'cross-site' }, 'GET')
    expect(res.status).toBe(200)
  })
})
