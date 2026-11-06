import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

    it('defaults kind to "workflow"', async () => {
      const res = await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Default kind' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.kind).toBe('workflow')
    })

    it('creates a script when kind is "script"', async () => {
      const res = await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Transform forwarder', kind: 'script' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.kind).toBe('script')
    })

    it('rejects an invalid kind', async () => {
      const res = await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bogus', kind: 'spaceship' }),
      })
      expect(res.status).toBe(422)
    })
  })

  describe('POST /api/workflows/:id/trigger (kind=script)', () => {
    it('returns 400 — scripts have no instance lifecycle', async () => {
      await mockDb.createWorkflow({
        id: 'script-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'My Script',
        kind: 'script',
      })
      const res = await app.request(url('/api/workflows/script-1/trigger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: 'conn-x' }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/no instance lifecycle/i)
    })
  })

  describe('GET /api/workflows', () => {
    it('lists workflows for the current project', async () => {
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'A',
      })
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'B',
      })
      await mockDb.createWorkflow({
        id: 'wf-3',
        projectId: 'other-project',
        createdBy: 'other-user',
        name: 'C',
      })

      const res = await app.request(url('/api/workflows'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(2)
    })
  })

  describe('GET /api/workflows/:id', () => {
    it('returns the workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Test',
      })

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
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: 'other-project',
        createdBy: 'other-user',
        name: 'Secret',
      })

      const res = await app.request(url('/api/workflows/wf-1'))
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/workflows/:id', () => {
    it('updates the workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Old',
      })

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
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: 'other-project',
        createdBy: 'other-user',
        name: 'Secret',
      })

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
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Delete me',
      })

      const res = await app.request(url('/api/workflows/wf-1'), { method: 'DELETE' })
      expect(res.status).toBe(200)

      const check = await mockDb.getWorkflowById('wf-1')
      expect(check).toBeNull()
    })

    it('returns 404 for another projects workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: 'other-project',
        createdBy: 'other-user',
        name: 'Not yours',
      })

      const res = await app.request(url('/api/workflows/wf-1'), { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })
})

describe('workflows in projects and workspaces', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  it('moves a workflow to another project and into that project’s oldest workspace', async () => {
    await mockDb.createProject({
      id: 'p-other',
      organizationId: 'test-org-1',
      name: 'Other',
      slug: 'other',
      defaultWorkspaceId: 'ws-other',
    })
    const created = await (
      await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mover' }),
      })
    ).json()

    const res = await app.request(url(`/api/workflows/${created.id}/move`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProjectId: 'p-other' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workflow).toMatchObject({ projectId: 'p-other', workspaceId: 'ws-other' })
    // Nothing of it is left in the old project's workspace.
    const old = await (await app.request(url('/api/workflows'))).json()
    expect(old.data.map((w: { id: string }) => w.id)).not.toContain(created.id)
  })

  it('masks secret values on the list as it does on a single read', async () => {
    const created = await (
      await app.request(url('/api/workflows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'With secret' }),
      })
    ).json()
    // As the column holds it (the PATCH route keeps per-workflow variables elsewhere in the mock).
    await mockDb.updateWorkflow(created.id, {
      envVars: JSON.stringify([
        { name: 'API_TOKEN', value: 'hunter2', isSecret: true },
        { name: 'REGION', value: 'eu', isSecret: false },
      ]),
    })
    const list = await (await app.request(url('/api/workflows'))).json()
    const row = list.data.find((w: { id: string }) => w.id === created.id)
    expect(row.envVars).not.toContain('hunter2')
    expect(row.envVars).toContain('REGION')
    expect(JSON.parse(row.envVars)).toContainEqual({
      name: 'API_TOKEN',
      value: '••••••••',
      isSecret: true,
    })
  })

  describe('PATCH /api/workflows/:id env vars', () => {
    afterEach(() => vi.restoreAllMocks())

    async function create() {
      return (
        await (
          await app.request(url('/api/workflows'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Env' }),
          })
        ).json()
      ).id as string
    }
    function patch(id: string, body: Record<string, unknown>) {
      return app.request(url(`/api/workflows/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    const MASK = '••••••••'
    const stored = [
      { name: 'API_TOKEN', value: 'hunter2', isSecret: true },
      { name: 'REGION', value: 'eu', isSecret: false },
    ]

    it('keeps the stored value when the mask comes back under the same secret name', async () => {
      const id = await create()
      vi.spyOn(mockDb, 'decodeWorkflowEnvVars').mockResolvedValue(stored)
      const set = vi.spyOn(mockDb, 'setWorkflowEnvVars')
      const res = await patch(id, { envVars: [{ name: 'API_TOKEN', value: MASK, isSecret: true }] })
      expect(res.status).toBe(200)
      expect(set).toHaveBeenCalledWith(id, [
        { name: 'API_TOKEN', value: 'hunter2', isSecret: true },
      ])
    })

    it('refuses the mask for a secret that is renamed, was never stored, or is sent as plain', async () => {
      const id = await create()
      vi.spyOn(mockDb, 'decodeWorkflowEnvVars').mockResolvedValue(stored)
      const set = vi.spyOn(mockDb, 'setWorkflowEnvVars')
      set.mockClear()
      for (const v of [
        { name: 'OTHER_TOKEN', value: MASK, isSecret: true },
        { name: 'REGION', value: MASK, isSecret: true },
        // A client that drops isSecret would replace the stored secret with the mask text.
        { name: 'API_TOKEN', value: MASK },
        { name: 'API_TOKEN', value: MASK, isSecret: false },
      ]) {
        const res = await patch(id, { envVars: [v] })
        expect(res.status).toBe(400)
        expect((await res.json()).error).toContain(v.name)
      }
      expect(set).not.toHaveBeenCalled()
    })

    it('refuses one name twice, and a plain variable whose name starts with SECRET_', async () => {
      const id = await create()
      const set = vi.spyOn(mockDb, 'setWorkflowEnvVars')
      set.mockClear()
      const twice = await patch(id, {
        envVars: [
          { name: 'A', value: '1', isSecret: true },
          { name: 'A', value: '2', isSecret: false },
        ],
      })
      expect(twice.status).toBe(422)
      const plain = await patch(id, { envVars: [{ name: 'SECRET_X', value: '1' }] })
      expect(plain.status).toBe(422)
      const secret = await patch(id, {
        envVars: [{ name: 'SECRET_X', value: '1', isSecret: true }],
      })
      expect(secret.status).toBe(200)
      expect(set).toHaveBeenCalledTimes(1)
    })

    it('answers 409 when the variables changed since the caller read them, and saves nothing', async () => {
      const id = await create()
      await mockDb.updateWorkflow(id, { envVars: JSON.stringify(stored) })
      const read = await (await app.request(url(`/api/workflows/${id}`))).json()
      expect(read.envVars).not.toContain('hunter2')
      const set = vi.spyOn(mockDb, 'setWorkflowEnvVars')
      set.mockClear()

      const stale = await patch(id, {
        envVars: [{ name: 'REGION', value: 'us' }],
        envVarsBase: JSON.stringify([{ name: 'REGION', value: 'old' }]),
      })
      expect(stale.status).toBe(409)
      expect(set).not.toHaveBeenCalled()

      const fresh = await patch(id, {
        envVars: [{ name: 'REGION', value: 'us' }],
        envVarsBase: read.envVars,
      })
      expect(fresh.status).toBe(200)
      expect(set).toHaveBeenCalledTimes(1)
    })
  })
})
