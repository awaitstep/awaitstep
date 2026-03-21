import type { DatabaseAdapter, Workflow, WorkflowVersion, Connection, WorkflowRun, ApiKey, Deployment } from '@awaitstep/db'
import { createApp } from '../app.js'
import type { Auth } from '../auth/config.js'

const store = {
  workflows: new Map<string, Workflow>(),
  versions: new Map<string, WorkflowVersion>(),
  connections: new Map<string, Connection>(),
  runs: new Map<string, WorkflowRun>(),
  apiKeys: new Map<string, ApiKey>(),
  deployments: new Map<string, Deployment>(),
}

export function resetStore() {
  store.workflows.clear()
  store.versions.clear()
  store.connections.clear()
  store.runs.clear()
  store.apiKeys.clear()
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
    const v: WorkflowVersion = { ...data, generatedCode: data.generatedCode ?? null, locked: 0, createdAt: now() }
    store.versions.set(v.id, v)
    return v
  },
  async getWorkflowVersionById(id) {
    return store.versions.get(id) ?? null
  },
  async getNextVersionNumber(workflowId) {
    const versions = [...store.versions.values()].filter((v) => v.workflowId === workflowId)
    return versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1
  },
  async listVersionsByWorkflow(workflowId) {
    return [...store.versions.values()].filter((v) => v.workflowId === workflowId).sort((a, b) => b.version - a.version)
  },
  async updateVersion(id, data) {
    const v = store.versions.get(id)
    if (!v) throw new Error('Not found')
    store.versions.set(id, { ...v, ...data })
  },
  async deleteVersion(id) {
    store.versions.delete(id)
  },
  async createConnection(data) {
    const c: Connection = { ...data, createdAt: now(), updatedAt: now() }
    store.connections.set(c.id, c)
    return c
  },
  async getProviderConnectionById(id) {
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
  async getWorkflowRunById(id) {
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
  async getActiveDeployment(workflowId) {
    return [...store.deployments.values()].filter((d) => d.workflowId === workflowId && d.status === 'success').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  },
  async isActiveDeploymentLocked(workflowId) {
    const deployment = [...store.deployments.values()].find((d) => d.workflowId === workflowId && d.status === 'success')
    if (!deployment) return false
    const version = store.versions.get(deployment.versionId)
    return version?.locked === 1
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
  async createApiKey(data) {
    const key: ApiKey = { ...data, expiresAt: null, lastUsedAt: null, revokedAt: null, createdAt: now() }
    store.apiKeys.set(key.id, key)
    return key
  },
  async getApiKeyByHash(keyHash) {
    return [...store.apiKeys.values()].find((k) => k.keyHash === keyHash && !k.revokedAt) ?? null
  },
  async listApiKeysByUser(userId) {
    return [...store.apiKeys.values()].filter((k) => k.userId === userId)
  },
  async updateApiKeyLastUsed(id, lastUsedAt) {
    const k = store.apiKeys.get(id)
    if (k) store.apiKeys.set(id, { ...k, lastUsedAt })
  },
  async revokeApiKey(id, userId) {
    const k = store.apiKeys.get(id)
    if (!k || k.userId !== userId) return null
    const revoked = { ...k, revokedAt: now() }
    store.apiKeys.set(id, revoked)
    return revoked
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
