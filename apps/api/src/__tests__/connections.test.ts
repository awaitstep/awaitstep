import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, mockDb } from './helpers.js'

describe('connection routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  describe('POST /api/connections', () => {
    it('creates a connection with redacted token', async () => {
      const res = await app.request('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'cf-123',
          apiToken: 'super-secret-token',
          name: 'My CF Account',
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('My CF Account')
      expect(body.accountId).toBe('cf-123')
      expect(body.apiToken).toBe('***')
    })

    it('returns 422 for missing fields', async () => {
      const res = await app.request('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Missing account' }),
      })
      expect(res.status).toBe(422)
    })
  })

  describe('GET /api/connections', () => {
    it('lists connections with redacted tokens', async () => {
      await mockDb.createConnection({
        id: 'conn-1',
        userId: TEST_USER_ID,
        accountId: 'cf-1',
        apiToken: 'secret-1',
        name: 'Account 1',
      })
      await mockDb.createConnection({
        id: 'conn-2',
        userId: 'other-user',
        accountId: 'cf-2',
        apiToken: 'secret-2',
        name: 'Account 2',
      })

      const res = await app.request('/api/connections')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].apiToken).toBe('***')
    })
  })

  describe('DELETE /api/connections/:id', () => {
    it('deletes own connection', async () => {
      await mockDb.createConnection({
        id: 'conn-1',
        userId: TEST_USER_ID,
        accountId: 'cf-1',
        apiToken: 'secret',
        name: 'Delete me',
      })

      const res = await app.request('/api/connections/conn-1', { method: 'DELETE' })
      expect(res.status).toBe(200)

      const check = await mockDb.getConnectionById('conn-1')
      expect(check).toBeNull()
    })

    it('returns 404 for another users connection', async () => {
      await mockDb.createConnection({
        id: 'conn-1',
        userId: 'other-user',
        accountId: 'cf-1',
        apiToken: 'secret',
        name: 'Not yours',
      })

      const res = await app.request('/api/connections/conn-1', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })
})
