import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

describe('workflow routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  describe('POST /api/workflows', () => {
    it('creates a workflow', async () => {
      const res = await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Workflow', description: 'A test' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('Test Workflow')
      expect(body.description).toBe('A test')
      expect(body.projectId).toBe(TEST_PROJECT_ID)
      expect(body.createdBy).toBe(TEST_USER_ID)
      expect(body.id).toBeTruthy()
    })

    it('returns 422 for missing name', async () => {
      const res = await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(422)
    })

    it('returns 422 for empty name', async () => {
      const res = await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      })
      expect(res.status).toBe(422)
    })
  })

  describe('GET /api/workflows', () => {
    it('lists workflows for the current project', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: TEST_PROJECT_ID, createdBy: TEST_USER_ID, name: 'A' })
      await mockDb.createWorkflow({ id: 'wf-2', projectId: TEST_PROJECT_ID, createdBy: TEST_USER_ID, name: 'B' })
      await mockDb.createWorkflow({ id: 'wf-3', projectId: 'other-project', createdBy: 'other-user', name: 'C' })

      const res = await app.request(url('/api/workflows'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
    })
  })

  describe('GET /api/workflows/:id', () => {
    it('returns the workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: TEST_PROJECT_ID, createdBy: TEST_USER_ID, name: 'Test' })

      const res = await app.request(url('/api/workflows/wf-1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Test')
    })

    it('returns 404 for nonexistent workflow', async () => {
      const res = await app.request(url('/api/workflows/nope'))
      expect(res.status).toBe(404)
    })

    it('returns 404 for workflow in another project', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: 'other-project', createdBy: 'other-user', name: 'Secret' })

      const res = await app.request(url('/api/workflows/wf-1'))
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/workflows/:id', () => {
    it('updates the workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: TEST_PROJECT_ID, createdBy: TEST_USER_ID, name: 'Old' })

      const res = await app.request(url('/api/workflows/wf-1'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('New')
    })

    it('returns 404 for another projects workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: 'other-project', createdBy: 'other-user', name: 'Secret' })

      const res = await app.request(url('/api/workflows/wf-1'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/workflows/:id', () => {
    it('deletes the workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: TEST_PROJECT_ID, createdBy: TEST_USER_ID, name: 'Delete me' })

      const res = await app.request(url('/api/workflows/wf-1'), { method: 'DELETE' })
      expect(res.status).toBe(200)

      const check = await mockDb.getWorkflowById('wf-1')
      expect(check).toBeNull()
    })

    it('returns 404 for another projects workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-1', projectId: 'other-project', createdBy: 'other-user', name: 'Not yours' })

      const res = await app.request(url('/api/workflows/wf-1'), { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })
})
