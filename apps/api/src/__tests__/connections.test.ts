import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, TEST_ORG_ID, mockDb } from './helpers.js'

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}organizationId=${TEST_ORG_ID}`
}

describe('connection routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  describe('POST /api/connections', () => {
    it('creates a connection with redacted credentials', async () => {
      const res = await app.request(url('/api/connections'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'cloudflare',
          credentials: { accountId: 'cf-123', apiToken: 'super-secret-token' },
          name: 'My CF Account',
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('My CF Account')
      expect(body.provider).toBe('cloudflare')
      expect(body.credentials.accountId).toBe('cf-123')
      expect(body.credentials.apiToken).toBe('***')
    })

    it('returns 422 for missing fields', async () => {
      const res = await app.request(url('/api/connections'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Missing provider' }),
      })
      expect(res.status).toBe(422)
    })
  })

  describe('GET /api/connections', () => {
    it('lists connections with redacted credentials', async () => {
      await mockDb.createConnection({
        id: 'conn-1',
        organizationId: TEST_ORG_ID,
        createdBy: TEST_USER_ID,
        provider: 'cloudflare',
        credentials: JSON.stringify({ accountId: 'cf-1', apiToken: 'secret-1' }),
        name: 'Account 1',
      })
      await mockDb.createConnection({
        id: 'conn-2',
        organizationId: 'other-org',
        createdBy: 'other-user',
        provider: 'cloudflare',
        credentials: JSON.stringify({ accountId: 'cf-2', apiToken: 'secret-2' }),
        name: 'Account 2',
      })

      const res = await app.request(url('/api/connections'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].credentials.apiToken).toBe('***')
      expect(body[0].credentials.accountId).toBe('cf-1')
    })
  })

  describe('DELETE /api/connections/:id', () => {
    it('deletes own connection', async () => {
      await mockDb.createConnection({
        id: 'conn-1',
        organizationId: TEST_ORG_ID,
        createdBy: TEST_USER_ID,
        provider: 'cloudflare',
        credentials: JSON.stringify({ accountId: 'cf-1', apiToken: 'secret' }),
        name: 'Delete me',
      })

      const res = await app.request(url('/api/connections/conn-1'), { method: 'DELETE' })
      expect(res.status).toBe(200)

      const check = await mockDb.getProviderConnectionById('conn-1')
      expect(check).toBeNull()
    })

    it('returns 404 for another orgs connection', async () => {
      await mockDb.createConnection({
        id: 'conn-1',
        organizationId: 'other-org',
        createdBy: 'other-user',
        provider: 'cloudflare',
        credentials: JSON.stringify({ accountId: 'cf-1', apiToken: 'secret' }),
        name: 'Not yours',
      })

      const res = await app.request(url('/api/connections/conn-1'), { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })
})
