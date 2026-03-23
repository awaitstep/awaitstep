import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_PROJECT_ID } from './helpers.js'

describe('app', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  it('responds to health check without auth', async () => {
    const res = await app.request('/health')
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
})
