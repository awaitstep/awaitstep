import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KEY_REQUIRED, KEYS_NOT_ACCEPTED } from '../middleware/auth.js'
import { checkPublicRunUrl } from '../lib/public-run-url.js'
import { createTestApp, mockDb, resetStore, TEST_ORG_ID } from './helpers.js'

// An entry can let in people only, or keys only: a dashboard's API and an
// API for other systems are then two addresses with one set of routes.

const PROJECTS = `/api/projects?organizationId=${TEST_ORG_ID}`
const asKey = { headers: { Authorization: 'Bearer ask_some-key' } }

describe('who an entry lets in', () => {
  beforeEach(() => resetStore())

  it('lets both in by default', async () => {
    const app = createTestApp()
    expect((await app.request(PROJECTS)).status).toBe(200)
    // The key is looked up, and is not one.
    const res = await app.request(PROJECTS, asKey)
    expect(await res.json()).toEqual({ error: 'Invalid API key' })
  })

  it('refuses a key on a sessions-only entry, without looking it up', async () => {
    const lookup = vi.spyOn(mockDb, 'getApiKeyAuthByHash')
    const app = createTestApp({ acceptedAuth: 'sessions' })
    const res = await app.request(PROJECTS, asKey)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: KEYS_NOT_ACCEPTED })
    expect(lookup).not.toHaveBeenCalled()
    expect((await app.request(PROJECTS)).status).toBe(200)
    lookup.mockRestore()
  })

  it('refuses a session on a keys-only entry, which has no sign-in routes', async () => {
    const app = createTestApp({ acceptedAuth: 'keys' })
    const res = await app.request(PROJECTS)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: KEY_REQUIRED })
    expect((await app.request('/api/auth/get-session')).status).toBe(401)
    expect(await (await app.request(PROJECTS, asKey)).json()).toEqual({
      error: 'Invalid API key',
    })
  })
})

describe('the address workflows are run at', () => {
  it('is not named unless the instance sets one', async () => {
    const body = await (await createTestApp().request('/api/instance')).json()
    expect(body).not.toHaveProperty('runUrl')
  })

  it('is told to the dashboard, without a trailing slash', async () => {
    const app = createTestApp({ publicRunUrl: 'https://run.example.test/run/' })
    expect(await (await app.request('/api/instance')).json()).toMatchObject({
      runUrl: 'https://run.example.test/run',
    })
  })

  it('must be a plain http(s) URL', () => {
    expect(checkPublicRunUrl('https://run.example.test')).toBe('https://run.example.test')
    for (const bad of [
      '/run',
      'ftp://x.test/run',
      'https://x.test/run?a=1',
      'https://u:p@x.test',
    ]) {
      expect(() => checkPublicRunUrl(bad), bad).toThrow()
    }
  })
})
