import type { DatabaseAdapter, Workflow, WorkflowVersion, Connection, WorkflowRun, Deployment } from '@awaitstep/db'
import { createApp } from '../app.js'
import type { Auth } from '../auth/config.js'

const store = {
  workflows: new Map<string, Workflow>(),
  versions: new Map<string, WorkflowVersion>(),
  connections: new Map<string, Connection>(),
  runs: new Map<string, WorkflowRun>(),
  deployments: new Map<string, Deployment>(),
}

export function resetStore() {
  store.workflows.clear()
  store.versions.clear()
  store.connections.clear()
  store.runs.clear()
  store.deployments.clear()
}

function now() {
  return new Date().toISOString()
}

const mockDb: DatabaseAdapter = {
  async createWorkflow(data) {
    const wf: Workflow = { ...data, description: data.description ?? null, currentVersionId: null, createdAt: now(), updatedAt: now() }
    store.workflows.set(wf.id, wf)
    return wf
  },
  async getWorkflowById(id) {
    return store.workflows.get(id) ?? null
  },
  async listWorkflowsByUser(userId) {
    return [...store.workflows.values()].filter((w) => w.userId === userId)
  },
  async updateWorkflow(id, data) {
    const wf = store.workflows.get(id)
    if (!wf) throw new Error('Not found')
    const updated = { ...wf, ...data, updatedAt: now() }
    store.workflows.set(id, updated)
    return updated
  },
  async deleteWorkflow(id) {
    store.workflows.delete(id)
  },
  async createVersion(data) {
    const v: WorkflowVersion = { ...data, generatedCode: data.generatedCode ?? null, createdAt: now() }
    store.versions.set(v.id, v)
    return v
  },
  async getVersionById(id) {
    return store.versions.get(id) ?? null
  },
  async listVersionsByWorkflow(workflowId) {
    return [...store.versions.values()].filter((v) => v.workflowId === workflowId).sort((a, b) => b.version - a.version)
  },
  async updateVersion(id, data) {
    const v = store.versions.get(id)
    if (!v) throw new Error('Not found')
    store.versions.set(id, { ...v, ...data })
  },
  async createConnection(data) {
    const c: Connection = { ...data, createdAt: now(), updatedAt: now() }
    store.connections.set(c.id, c)
    return c
  },
  async getConnectionById(id) {
    return store.connections.get(id) ?? null
  },
  async listConnectionsByUser(userId) {
    return [...store.connections.values()].filter((c) => c.userId === userId)
  },
  async deleteConnection(id) {
    store.connections.delete(id)
  },
  async createRun(data) {
    const r: WorkflowRun = { ...data, output: null, error: null, createdAt: now(), updatedAt: now() }
    store.runs.set(r.id, r)
    return r
  },
  async getRunById(id) {
    return store.runs.get(id) ?? null
  },
  async listRunsByWorkflow(workflowId) {
    return [...store.runs.values()].filter((r) => r.workflowId === workflowId)
  },
  async updateRun(id, data) {
    const r = store.runs.get(id)
    if (!r) throw new Error('Not found')
    const updated = { ...r, ...data, updatedAt: now() }
    store.runs.set(id, updated)
    return updated
  },
  async listRecentRunsByUser(userId) {
    const wfIds = new Set([...store.workflows.values()].filter((w) => w.userId === userId).map((w) => w.id))
    return [...store.runs.values()].filter((r) => wfIds.has(r.workflowId))
  },
  async createDeployment(data) {
    const d: Deployment = { ...data, serviceUrl: data.serviceUrl ?? null, error: data.error ?? null, createdAt: now() }
    store.deployments.set(d.id, d)
    return d
  },
  async listDeploymentsByWorkflow(workflowId) {
    return [...store.deployments.values()].filter((d) => d.workflowId === workflowId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async listRecentDeploymentsByUser(userId) {
    const wfIds = new Set([...store.workflows.values()].filter((w) => w.userId === userId).map((w) => w.id))
    return [...store.deployments.values()].filter((d) => wfIds.has(d.workflowId))
  },
  async deleteDeploymentsByWorkflow(workflowId) {
    for (const [id, d] of store.deployments) {
      if (d.workflowId === workflowId) store.deployments.delete(id)
    }
  },
}

const TEST_USER_ID = 'test-user-1'

const mockAuth = {
  handler: async () => new Response(JSON.stringify({ ok: true })),
  api: {
    getSession: async () => ({
      user: { id: TEST_USER_ID, email: 'test@example.com', name: 'Test' },
      session: { id: 'session-1', userId: TEST_USER_ID, expiresAt: new Date(Date.now() + 86400000) },
    }),
  },
} as unknown as Auth

export { mockDb, mockAuth, TEST_USER_ID }

export function createTestApp() {
  return createApp({
    db: mockDb,
    auth: mockAuth,
    corsOrigin: '*',
    isDev: true,
  })
}
