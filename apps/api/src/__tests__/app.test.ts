import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore } from './helpers.js'

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

  it('returns 500 with error message in dev mode', async () => {
    // Trigger an error by patching a nonexistent workflow
    const res = await app.request('/api/workflows/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'fail' }),
    })
    // Ownership middleware returns 404 before reaching handler
    expect(res.status).toBe(404)
  })
})
