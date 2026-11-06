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

  describe('who saved a version', () => {
    it('stamps the saver on a new version, and the new saver on one saved over', async () => {
      const first = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      const created = await first.json()
      expect(created.createdBy).toBe(TEST_USER_ID)
      // Undeployed, so the next save overwrites it in place: still stamped, and dated now.
      await mockDb.updateVersion(created.id, {
        createdBy: 'someone-else',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      const second = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: modifiedIR }),
      })
      const saved = await second.json()
      expect(saved.createdBy).toBe(TEST_USER_ID)
      expect(saved.createdAt > '2026-01-01T00:00:00.000Z').toBe(true)
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

  describe('DELETE /api/workflows/:id/versions/:versionId keeps the newest three', () => {
    beforeEach(async () => {
      for (const n of [1, 2, 3, 4, 5]) {
        await mockDb.createVersion({ id: `v-${n}`, workflowId: 'wf-1', ir: '{}' })
      }
      await mockDb.updateWorkflow('wf-1', { currentVersionId: 'v-5' })
    })

    const remove = (id: string) =>
      app.request(url(`/api/workflows/wf-1/versions/${id}`), { method: 'DELETE' })

    it('refuses the three newest, with why', async () => {
      for (const id of ['v-3', 'v-4']) {
        const res = await remove(id)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe(
          'Keep the 3 newest versions: they are what a bad deploy rolls back to',
        )
      }
      expect((await (await remove('v-5')).json()).error).toBe('Cannot delete the active version')
      expect(await mockDb.getWorkflowVersionById('v-3')).not.toBeNull()
    })

    it('deletes an older one, even one still deployed on an account', async () => {
      await mockDb.createDeployment({
        id: 'dep-old',
        workflowId: 'wf-1',
        versionId: 'v-2',
        versionNumber: 2,
        connectionId: 'conn-1',
        serviceName: 'svc',
        status: 'success',
      })
      await mockDb.createDeployment({
        id: 'dep-new',
        workflowId: 'wf-1',
        versionId: 'v-5',
        versionNumber: 5,
        connectionId: 'conn-2',
        serviceName: 'svc',
        status: 'success',
      })
      expect((await remove('v-2')).status).toBe(200)
      expect(await mockDb.getWorkflowVersionById('v-2')).toBeNull()
    })

    it('still refuses the version the newest deploy carries', async () => {
      await mockDb.createDeployment({
        id: 'dep-1',
        workflowId: 'wf-1',
        versionId: 'v-1',
        versionNumber: 1,
        connectionId: 'conn-1',
        serviceName: 'svc',
        status: 'success',
      })
      expect((await (await remove('v-1')).json()).error).toBe('Cannot delete a deployed version')
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
      // Two more, so v2 is past the newest three once the revert adds one.
      await mockDb.createVersion({ id: 'v-3', workflowId: 'wf-1', ir: JSON.stringify(validIR) })
      const v4 = await mockDb.createVersion({
        id: 'v-4',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: v4.id })

      const reverted = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}/revert`), {
        method: 'POST',
      })
      expect(reverted.status).toBe(201)
      // The new version a revert makes is the reverter's.
      expect((await reverted.json()).createdBy).toBe(TEST_USER_ID)
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
