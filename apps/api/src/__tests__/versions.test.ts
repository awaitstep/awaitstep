import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, mockDb } from './helpers.js'

const validIR = {
  metadata: {
    name: 'test',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    { id: 'step-1', type: 'step', name: 'Hello', position: { x: 0, y: 0 }, code: 'return 1;' },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

describe('version routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createWorkflow({ id: 'wf-1', userId: TEST_USER_ID, name: 'Test' })
  })

  describe('POST /api/workflows/:workflowId/versions', () => {
    it('creates a version with generated code', async () => {
      const res = await app.request('/api/workflows/wf-1/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.version).toBe(1)
      expect(body.workflowId).toBe('wf-1')
      expect(body.generatedCode).toContain('WorkflowEntrypoint')
    })

    it('auto-increments version number', async () => {
      await app.request('/api/workflows/wf-1/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const res = await app.request('/api/workflows/wf-1/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.version).toBe(2)
    })

    it('updates workflow currentVersionId', async () => {
      await app.request('/api/workflows/wf-1/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const wf = await mockDb.getWorkflowById('wf-1')
      expect(wf?.currentVersionId).toBeTruthy()
    })

    it('returns 404 for another users workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-other', userId: 'other-user', name: 'Secret' })

      const res = await app.request('/api/workflows/wf-other/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/workflows/:workflowId/versions', () => {
    it('lists versions for a workflow', async () => {
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', version: 1, ir: '{}' })
      await mockDb.createVersion({ id: 'v-2', workflowId: 'wf-1', version: 2, ir: '{}' })

      const res = await app.request('/api/workflows/wf-1/versions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
    })
  })

  describe('GET /api/workflows/:workflowId/versions/:versionId', () => {
    it('returns a specific version', async () => {
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', version: 1, ir: '{"test":true}' })

      const res = await app.request('/api/workflows/wf-1/versions/v-1')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ir).toBe('{"test":true}')
    })

    it('returns 404 for version from different workflow', async () => {
      await mockDb.createWorkflow({ id: 'wf-2', userId: TEST_USER_ID, name: 'Other' })
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-2', version: 1, ir: '{}' })

      const res = await app.request('/api/workflows/wf-1/versions/v-1')
      expect(res.status).toBe(404)
    })
  })
})
