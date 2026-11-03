import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTestApp,
  recordedAuditEvents,
  resetStore,
  TEST_USER_ID,
  TEST_PROJECT_ID,
  mockDb,
} from './helpers.js'

const validIR = {
  metadata: {
    name: 'test',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

const modifiedIR = {
  ...validIR,
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Modified',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 2;' },
    },
  ],
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

describe('version routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
  })

  describe('POST /api/workflows/:workflowId/versions', () => {
    it('creates a version with IR only', async () => {
      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.version).toBe(1)
      expect(body.workflowId).toBe('wf-1')
      expect(body.ir).toBeDefined()
    })

    it('refuses a first save that seeds a generated project path', async () => {
      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ir: {
            ...validIR,
            runtime: { files: [{ path: 'awaitstep/util.ts', source: 'export const x = 1' }] },
          },
        }),
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { details: { path: string; message: string }[] }
      expect(body.details).toContainEqual(expect.objectContaining({ path: 'awaitstep/util.ts' }))
    })

    it('returns existing version when IR has not changed', async () => {
      await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(1)
    })

    it('overwrites undeployed version when IR changes', async () => {
      await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: modifiedIR }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(1)
    })

    it('updates workflow currentVersionId', async () => {
      await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const wf = await mockDb.getWorkflowById('wf-1')
      expect(wf?.currentVersionId).toBeTruthy()
    })

    it('returns 404 for another projects workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-other',
        projectId: 'other-project',
        createdBy: 'other-user',
        name: 'Secret',
      })

      const res = await app.request(url('/api/workflows/wf-other/versions'), {
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

      const res = await app.request(url('/api/workflows/wf-1/versions'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(2)
    })
  })

  describe('GET /api/workflows/:workflowId/versions/:versionId', () => {
    it('returns a specific version', async () => {
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', version: 1, ir: '{"test":true}' })

      const res = await app.request(url('/api/workflows/wf-1/versions/v-1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ir).toBe('{"test":true}')
    })

    it('returns 404 for version from different workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Other',
      })
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-2', version: 1, ir: '{}' })

      const res = await app.request(url('/api/workflows/wf-1/versions/v-1'))
      expect(res.status).toBe(404)
    })
  })

  describe('the audit log (B7)', () => {
    it('records a revert and a version deletion with the version number', async () => {
      const v1 = await mockDb.createVersion({
        id: 'v-1',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      const v2 = await mockDb.createVersion({
        id: 'v-2',
        workflowId: 'wf-1',
        ir: JSON.stringify(modifiedIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: v2.id })

      const reverted = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}/revert`), {
        method: 'POST',
      })
      expect(reverted.status).toBe(201)
      const deleted = await app.request(url(`/api/workflows/wf-1/versions/${v2.id}`), {
        method: 'DELETE',
      })
      expect(deleted.status).toBe(200)

      expect(
        recordedAuditEvents().map((e) => [e.event, e.kind, e.target, e.detail, e.level]),
      ).toEqual([
        ['version.revert', 'deploy', 'Test', `To v${v1.version} · Dashboard`, 'workspace'],
        ['version.delete', 'danger', `Test v${v2.version}`, 'Dashboard', 'workspace'],
      ])
    })

    it('records nothing for a refused deletion', async () => {
      const v1 = await mockDb.createVersion({
        id: 'v-1',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: v1.id })
      const res = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}`), {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
      expect(recordedAuditEvents()).toEqual([])
    })
  })
})
