import type {
  DatabaseAdapter,
  Workflow,
  WorkflowVersion,
  Connection,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowFile,
  ApiKey,
  Deployment,
  Project,
  InstalledNode,
} from '@awaitstep/db'
import { createApp, type AppDeps } from '../app.js'
import type { Auth } from '../auth/config.js'

const store = {
  workflows: new Map<string, Workflow>(),
  versions: new Map<string, WorkflowVersion>(),
  connections: new Map<string, Connection>(),
  runs: new Map<string, WorkflowRun>(),
  runSteps: new Map<string, WorkflowRunStep>(),
  files: new Map<string, WorkflowFile>(),
  apiKeys: new Map<string, ApiKey>(),
  deployments: new Map<string, Deployment>(),
  projects: new Map<string, Project>(),
  installedNodes: new Map<string, InstalledNode>(),
}

export function resetStore() {
  store.workflows.clear()
  store.versions.clear()
  store.connections.clear()
  store.runs.clear()
  store.runSteps.clear()
  store.files.clear()
  store.apiKeys.clear()
  store.deployments.clear()
  store.projects.clear()
  store.installedNodes.clear()
}

function now() {
  return new Date().toISOString()
}

export const TEST_USER_ID = 'test-user-1'
export const TEST_ORG_ID = 'test-org-1'
export const TEST_PROJECT_ID = 'test-project-1'

const mockDb: DatabaseAdapter = {
  // Membership
  async isOrgMember(userId, organizationId) {
    return userId === TEST_USER_ID && organizationId === TEST_ORG_ID
  },
  async getProjectIfMember(userId, projectId) {
    const project = store.projects.get(projectId)
    if (!project) return null
    if (userId !== TEST_USER_ID || project.organizationId !== TEST_ORG_ID) return null
    return project
  },

  // Projects
  async createProject(data) {
    const p: Project = {
      ...data,
      description: data.description ?? null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.projects.set(p.id, p)
    return p
  },
  async getProjectById(id) {
    return store.projects.get(id) ?? null
  },
  async listProjectsByOrganization(organizationId) {
    return {
      data: [...store.projects.values()].filter((p) => p.organizationId === organizationId),
      nextCursor: null,
    }
  },
  async updateProject(id, data) {
    const p = store.projects.get(id)
    if (!p) throw new Error('Not found')
    const updated = { ...p, ...data, updatedAt: now() }
    store.projects.set(id, updated)
    return updated
  },
  async deleteProject(id) {
    store.projects.delete(id)
  },

  // Workflows
  async createWorkflow(data) {
    const wf: Workflow = {
      ...data,
      description: data.description ?? null,
      kind: data.kind ?? 'workflow',
      currentVersionId: null,
      envVars: null,
      triggerCode: null,
      dependencies: null,
      deployConfig: null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.workflows.set(wf.id, wf)
    return wf
  },
  async getWorkflowById(id) {
    return store.workflows.get(id) ?? null
  },
  async listWorkflowsByProject(projectId) {
    return {
      data: [...store.workflows.values()].filter((w) => w.projectId === projectId),
      nextCursor: null,
    }
  },
  async listWorkflowsWithStatus(projectId) {
    return {
      data: [...store.workflows.values()]
        .filter((w) => w.projectId === projectId)
        .map((w) => ({
          ...w,
          deployStatus: null,
          deployVersionId: null,
          lastRunStatus: null,
          lastRunAt: null,
        })),
      nextCursor: null,
    }
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

  // Versions
  async createVersion(data) {
    const maxExisting = Math.max(
      0,
      ...[...store.versions.values()]
        .filter((v) => v.workflowId === data.workflowId)
        .map((v) => v.version),
    )
    const assigned = data.version ?? maxExisting + 1
    const v: WorkflowVersion = {
      sourceMode: 'generated',
      source: null,
      manifest: null,
      baseGeneratedHash: null,
      ...data,
      version: assigned,
      locked: 0,
      createdAt: now(),
    }
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
    return {
      data: [...store.versions.values()]
        .filter((v) => v.workflowId === workflowId)
        .sort((a, b) => b.version - a.version),
      nextCursor: null,
    }
  },
  async updateVersion(id, data) {
    const v = store.versions.get(id)
    if (!v) throw new Error('Not found')
    store.versions.set(id, { ...v, ...data })
  },
  async deleteVersion(id) {
    store.versions.delete(id)
  },

  // Connections
  async createConnection(data) {
    const c: Connection = { ...data, createdAt: now(), updatedAt: now() }
    store.connections.set(c.id, c)
    return c
  },
  async getProviderConnectionById(id) {
    return store.connections.get(id) ?? null
  },
  async listConnectionsByOrganization(organizationId) {
    return {
      data: [...store.connections.values()].filter((c) => c.organizationId === organizationId),
      nextCursor: null,
    }
  },
  async updateConnection(id, data) {
    const c = store.connections.get(id)
    if (!c) return null
    const updated = { ...c, ...data, updatedAt: now() }
    store.connections.set(id, updated)
    return updated
  },
  async deleteConnection(id) {
    store.connections.delete(id)
  },

  // Runs
  async createRun(data) {
    const r: WorkflowRun = {
      ...data,
      output: null,
      error: null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.runs.set(r.id, r)
    return r
  },
  async getWorkflowRunById(id) {
    return store.runs.get(id) ?? null
  },
  async listRunsByWorkflow(workflowId) {
    return {
      data: [...store.runs.values()].filter((r) => r.workflowId === workflowId),
      nextCursor: null,
    }
  },
  async updateRun(id, data) {
    const r = store.runs.get(id)
    if (!r) throw new Error('Not found')
    const updated = { ...r, ...data, updatedAt: now() }
    store.runs.set(id, updated)
    return updated
  },
  async listRecentRunsByProject(projectId) {
    const wfIds = new Set(
      [...store.workflows.values()].filter((w) => w.projectId === projectId).map((w) => w.id),
    )
    return {
      data: [...store.runs.values()].filter((r) => wfIds.has(r.workflowId)),
      nextCursor: null,
    }
  },
  async listActiveRunsForSync() {
    const terminal = new Set(['complete', 'errored', 'terminated'])
    return [...store.runs.values()]
      .filter((r) => !terminal.has(r.status))
      .map((run) => {
        const deployment = [...store.deployments.values()]
          .filter(
            (d) =>
              d.workflowId === run.workflowId &&
              d.versionId === run.versionId &&
              d.status === 'success',
          )
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
        return {
          run,
          workflowName: store.workflows.get(run.workflowId)?.name ?? '',
          configSnapshot: deployment?.configSnapshot ?? null,
        }
      })
  },

  async getRunForSync(runId, workflowId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return null
    const [entry] = (await this.listActiveRunsForSync()).filter((e) => e.run.id === runId)
    return (
      entry ?? {
        run,
        workflowName: store.workflows.get(run.workflowId)?.name ?? '',
        configSnapshot: null,
      }
    )
  },

  // Run steps
  async upsertRunSteps(runId, steps) {
    for (const s of steps) {
      const key = `${runId}|${s.stepName}|${s.kind}|${s.stepIndex}`
      const existing = store.runSteps.get(key)
      store.runSteps.set(key, {
        id: existing?.id ?? s.id,
        runId,
        nodeId: s.nodeId ?? null,
        stepName: s.stepName,
        kind: s.kind,
        stepIndex: s.stepIndex,
        status: s.status,
        attemptCount: s.attemptCount,
        error: s.error ?? null,
        startedAt: s.startedAt ?? null,
        endedAt: s.endedAt ?? null,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      })
    }
  },
  async listRunSteps(runId, workflowId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return { steps: [], configSnapshot: null }
    const deployment = [...store.deployments.values()]
      .filter(
        (d) =>
          d.workflowId === run.workflowId &&
          d.versionId === run.versionId &&
          d.status === 'success',
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
    const steps = [...store.runSteps.values()].filter((s) => s.runId === runId)
    return {
      steps,
      // The adapter's scalar subquery rides on step rows: no rows, no snapshot.
      configSnapshot: steps.length > 0 ? (deployment?.configSnapshot ?? null) : null,
    }
  },

  // Project files
  async listWorkflowFiles(workflowId) {
    return [...store.files.values()]
      .filter((f) => f.workflowId === workflowId)
      .sort((a, b) => (a.path < b.path ? -1 : 1))
  },
  async getWorkflowFile(workflowId, path) {
    return store.files.get(`${workflowId}|${path}`) ?? null
  },
  async upsertWorkflowFile(data) {
    const [row] = await this.upsertWorkflowFiles([data])
    return row!
  },
  async upsertWorkflowFiles(rows) {
    return rows.map((data) => {
      const key = `${data.workflowId}|${data.path}`
      const existing = store.files.get(key)
      const row: WorkflowFile = {
        id: existing?.id ?? data.id,
        workflowId: data.workflowId,
        path: data.path,
        source: data.source,
        hash: data.hash,
        size: data.size,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      }
      store.files.set(key, row)
      return row
    })
  },
  async createWorkflowFile(data) {
    const key = `${data.workflowId}|${data.path}`
    if (store.files.has(key)) return null
    const [row] = await this.upsertWorkflowFiles([data])
    return row!
  },
  async updateWorkflowFileIfMatches(data, expectedHash) {
    const key = `${data.workflowId}|${data.path}`
    const existing = store.files.get(key)
    if (!existing) return null
    if (expectedHash !== '*' && existing.hash !== expectedHash) return null
    const row: WorkflowFile = {
      ...existing,
      source: data.source,
      hash: data.hash,
      size: data.size,
      updatedAt: now(),
    }
    store.files.set(key, row)
    return row
  },
  async replaceWorkflowFiles(workflowId, rows) {
    for (const [key, file] of store.files) {
      if (file.workflowId === workflowId) store.files.delete(key)
    }
    return this.upsertWorkflowFiles(rows)
  },
  async deleteWorkflowFile(workflowId, path, expectedHash) {
    const key = `${workflowId}|${path}`
    const existing = store.files.get(key)
    if (!existing) return false
    if (expectedHash !== undefined && existing.hash !== expectedHash) return false
    return store.files.delete(key)
  },

  // Deployments
  async createDeployment(data) {
    const d: Deployment = {
      ...data,
      serviceUrl: data.serviceUrl ?? null,
      error: data.error ?? null,
      createdAt: now(),
    }
    store.deployments.set(d.id, d)
    return d
  },
  async getActiveDeployment(workflowId) {
    return (
      [...store.deployments.values()]
        .filter((d) => d.workflowId === workflowId && d.status === 'success')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    )
  },
  async isActiveDeploymentLocked(workflowId) {
    const deployment = [...store.deployments.values()].find(
      (d) => d.workflowId === workflowId && d.status === 'success',
    )
    if (!deployment) return false
    const version = store.versions.get(deployment.versionId)
    return version?.locked === 1
  },
  async listDeploymentsByWorkflow(workflowId) {
    return {
      data: [...store.deployments.values()]
        .filter((d) => d.workflowId === workflowId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      nextCursor: null,
    }
  },
  async listRecentDeploymentsByProject(projectId) {
    const wfIds = new Set(
      [...store.workflows.values()].filter((w) => w.projectId === projectId).map((w) => w.id),
    )
    return {
      data: [...store.deployments.values()].filter((d) => wfIds.has(d.workflowId)),
      nextCursor: null,
    }
  },
  async deleteDeploymentsByWorkflow(workflowId) {
    for (const [id, d] of store.deployments) {
      if (d.workflowId === workflowId) store.deployments.delete(id)
    }
  },

  // API Keys
  async createApiKey(data) {
    const key: ApiKey = {
      ...data,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now(),
    }
    store.apiKeys.set(key.id, key)
    return key
  },
  async getApiKeyById(id) {
    return store.apiKeys.get(id) ?? null
  },
  async getApiKeyByHash(keyHash) {
    return [...store.apiKeys.values()].find((k) => k.keyHash === keyHash && !k.revokedAt) ?? null
  },
  async listApiKeysByOrganization() {
    return { data: [...store.apiKeys.values()], nextCursor: null }
  },
  async listApiKeysByProject(projectId) {
    return {
      data: [...store.apiKeys.values()].filter((k) => k.projectId === projectId),
      nextCursor: null,
    }
  },
  async updateApiKeyLastUsed(id, lastUsedAt) {
    const k = store.apiKeys.get(id)
    if (k) store.apiKeys.set(id, { ...k, lastUsedAt })
  },
  async revokeApiKey(id, projectId) {
    const k = store.apiKeys.get(id)
    if (!k || k.projectId !== projectId) return null
    const revoked = { ...k, revokedAt: now() }
    store.apiKeys.set(id, revoked)
    return revoked
  },

  // Env Vars
  async createEnvVar(data) {
    return {
      ...data,
      projectId: data.projectId ?? null,
      isSecret: data.isSecret,
      createdAt: now(),
      updatedAt: now(),
    }
  },
  async getEnvVarById() {
    return null
  },
  async listEnvVarsByOrganization() {
    return { data: [], nextCursor: null }
  },
  async listEnvVarsByProject() {
    return { data: [], nextCursor: null }
  },
  async updateEnvVar() {
    return null
  },
  async deleteEnvVar() {},
  async getWorkflowEnvVars() {
    return []
  },
  async setWorkflowEnvVars() {},
  async resolveEnvVars() {
    return {}
  },

  // Installed Nodes
  async installNode(data) {
    const node: InstalledNode = {
      ...data,
      installedAt: now(),
      updatedAt: now(),
    }
    store.installedNodes.set(`${data.organizationId}:${data.nodeId}`, node)
    return node
  },
  async uninstallNode(organizationId, nodeId) {
    store.installedNodes.delete(`${organizationId}:${nodeId}`)
  },
  async listInstalledNodes(organizationId) {
    return {
      data: [...store.installedNodes.values()].filter((n) => n.organizationId === organizationId),
      nextCursor: null,
    }
  },
  async getInstalledNode(organizationId, nodeId) {
    return store.installedNodes.get(`${organizationId}:${nodeId}`) ?? null
  },
  async updateInstalledNodeBundle(organizationId, nodeId, data) {
    const key = `${organizationId}:${nodeId}`
    const n = store.installedNodes.get(key)
    if (!n) throw new Error('Not found')
    const updated = { ...n, ...data, updatedAt: now() }
    store.installedNodes.set(key, updated)
    return updated
  },
}

const mockAuth = {
  handler: async () => new Response(JSON.stringify({ ok: true })),
  api: {
    getSession: async () => ({
      user: { id: TEST_USER_ID, email: 'test@example.com', name: 'Test' },
      session: {
        id: 'session-1',
        userId: TEST_USER_ID,
        expiresAt: new Date(Date.now() + 86400000),
        activeOrganizationId: TEST_ORG_ID,
      },
    }),
  },
} as unknown as Auth

export { mockDb, mockAuth }

export function createTestApp(options?: { remoteNodeRegistry?: AppDeps['remoteNodeRegistry'] }) {
  // Seed the test project so auth middleware can find it
  store.projects.set(TEST_PROJECT_ID, {
    id: TEST_PROJECT_ID,
    organizationId: TEST_ORG_ID,
    name: 'Test Project',
    slug: 'test-project',
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  return createApp({
    db: mockDb,
    auth: mockAuth,
    corsOrigin: '*',
    isDev: true,
    remoteNodeRegistry: options?.remoteNodeRegistry,
  })
}
