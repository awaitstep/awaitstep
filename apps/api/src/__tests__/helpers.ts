import type {
  DatabaseAdapter,
  Workflow,
  WorkflowVersion,
  Connection,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowFile,
  TestSession,
  TestSessionCutoffs,
  TestSessionExpiry,
  ApiKey,
  Deployment,
  DeploymentConfig,
  EnvVar,
  Project,
  InstalledNode,
} from '@awaitstep/db'
import type {
  GeneratedBundle,
  ProcessLogEntry,
  StartedTestSessionHandle,
  TestSessionRunner,
  TestSessionTarget,
} from '@awaitstep/codegen'
import { createApp, type AppDeps } from '../app.js'
import type { Auth } from '../auth/config.js'

const store = {
  workflows: new Map<string, Workflow>(),
  versions: new Map<string, WorkflowVersion>(),
  connections: new Map<string, Connection>(),
  runs: new Map<string, WorkflowRun>(),
  runSteps: new Map<string, WorkflowRunStep>(),
  files: new Map<string, WorkflowFile>(),
  testSessions: new Map<string, TestSession>(),
  deploymentConfigs: new Map<string, DeploymentConfig>(),
  apiKeys: new Map<string, ApiKey>(),
  deployments: new Map<string, Deployment>(),
  projects: new Map<string, Project>(),
  installedNodes: new Map<string, InstalledNode>(),
  envVars: new Map<string, EnvVar>(),
}

export function resetStore() {
  store.workflows.clear()
  store.versions.clear()
  store.connections.clear()
  store.runs.clear()
  store.runSteps.clear()
  store.files.clear()
  store.testSessions.clear()
  store.deploymentConfigs.clear()
  store.apiKeys.clear()
  store.deployments.clear()
  store.projects.clear()
  store.installedNodes.clear()
  store.envVars.clear()
}

function now() {
  return new Date().toISOString()
}

// A session whose workflow was deleted keeps its row (the container is still
// running) but belongs to no project any more.
function sessionProject(session: TestSession): string | null {
  return session.workflowId ? (store.workflows.get(session.workflowId)?.projectId ?? null) : null
}

// A session that may still own a container — what the cap counts and what
// the unique index covers.
function isUnfinishedSession(session: TestSession): boolean {
  return session.status === 'starting' || session.status === 'running'
}

// Mirrors the adapter's expiry CASE. Kept in one place here so the mock and
// the real adapter cannot disagree about the same row.
function sessionExpiry(session: TestSession, cutoffs: TestSessionCutoffs): TestSessionExpiry {
  if (!isUnfinishedSession(session)) return null
  if (session.status === 'starting') {
    return session.createdAt <= cutoffs.starting ? 'start-timeout' : null
  }
  if (session.createdAt <= cutoffs.started) return 'lifetime'
  if (session.lastUsedAt <= cutoffs.idle) return 'idle'
  return null
}

function isLiveSession(session: TestSession, cutoffs: TestSessionCutoffs): boolean {
  return isUnfinishedSession(session) && sessionExpiry(session, cutoffs) === null
}

function envVarInScope(
  v: EnvVar,
  scope: { organizationId: string; projectId?: string | null },
): boolean {
  if (v.organizationId !== scope.organizationId) return false
  if (scope.projectId === undefined) return true
  return v.projectId === scope.projectId
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
  async updateProject(id, organizationId, data) {
    const p = store.projects.get(id)
    if (!p || p.organizationId !== organizationId) return null
    const updated = { ...p, ...data, updatedAt: now() }
    store.projects.set(id, updated)
    return updated
  },
  async deleteProject(id, organizationId) {
    const p = store.projects.get(id)
    if (!p || p.organizationId !== organizationId) return false
    return store.projects.delete(id)
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
      // The dead source columns, as a real row comes back from the adapter —
      // mirrored here, not configurable, because `CreateVersionData` no
      // longer carries them. Both copies go in the Phase 2 cleanup.
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
  async listWorkflowFileSummaries(workflowId) {
    return (await this.listWorkflowFiles(workflowId)).map(({ source: _source, ...rest }) => rest)
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

  // Test sessions — the caps the real adapter enforces inside its INSERT are
  // applied here in the same order, so route tests see the same refusals.
  async reserveTestSession(data, limits) {
    const unfinished = [...store.testSessions.values()].filter(isUnfinishedSession)
    const held = unfinished.filter((s) => s.userId === data.userId)
    if (held.length >= limits.maxConcurrentPerUser) return null
    if (unfinished.length >= limits.maxConcurrentTotal) return null
    const inProject = [...store.testSessions.values()].filter(
      (s) => sessionProject(s) === limits.projectId && s.createdAt >= limits.quotaWindowStart,
    )
    if (inProject.length >= limits.maxPerWindowPerProject) return null

    // What the partial unique index enforces: one unfinished row per
    // (user, slot). Without it a route test can never reach the race path.
    const slot = Math.max(-1, ...held.map((s) => s.slot)) + 1
    if (held.some((s) => s.slot === slot)) return null

    const session: TestSession = {
      id: data.id,
      workflowId: data.workflowId,
      slot,
      versionId: data.versionId ?? null,
      userId: data.userId,
      runtime: data.runtime,
      containerId: data.containerId,
      processId: null,
      port: null,
      status: 'starting',
      error: null,
      createdAt: now(),
      lastUsedAt: now(),
      stoppedAt: null,
    }
    store.testSessions.set(session.id, session)
    return session
  },
  async activateTestSession(id, userId, processId, port, cutoffs) {
    const session = store.testSessions.get(id)
    if (!session || session.userId !== userId) return null
    if (session.status !== 'starting' || session.createdAt <= cutoffs.starting) return null
    const activated: TestSession = {
      ...session,
      processId,
      port,
      status: 'running',
      lastUsedAt: now(),
    }
    store.testSessions.set(id, activated)
    return activated
  },
  async getOwnedTestSession(id, userId, projectId, cutoffs) {
    const session = store.testSessions.get(id)
    if (!session || session.userId !== userId) return null
    const workflow = session.workflowId ? store.workflows.get(session.workflowId) : undefined
    if (!workflow || workflow.projectId !== projectId) return null
    return { session, workflow, expiry: sessionExpiry(session, cutoffs) }
  },
  async getLiveTestSessionForWorkflow(workflowId, userId, cutoffs) {
    return (
      [...store.testSessions.values()]
        .filter(
          (s) => s.workflowId === workflowId && s.userId === userId && isLiveSession(s, cutoffs),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    )
  },
  async getTestSessionUsage(projectId, userId, quotaWindowStart) {
    const sessions = [...store.testSessions.values()]
    return {
      activeForUser: sessions.filter((s) => s.userId === userId && isUnfinishedSession(s)).length,
      activeEverywhere: sessions.filter(isUnfinishedSession).length,
      createdInWindow: sessions.filter(
        (s) => sessionProject(s) === projectId && s.createdAt >= quotaWindowStart,
      ).length,
    }
  },
  async touchTestSession(id, userId, cutoffs) {
    const session = store.testSessions.get(id)
    if (!session || session.userId !== userId) return false
    if (session.status !== 'running' || !isLiveSession(session, cutoffs)) return false
    store.testSessions.set(id, { ...session, lastUsedAt: now() })
    return true
  },
  async markTestSessionStopped(id, status, options) {
    const session = store.testSessions.get(id)
    if (!session || (session.status !== 'running' && session.status !== 'starting')) return false
    if (options?.userId && session.userId !== options.userId) return false
    store.testSessions.set(id, {
      ...session,
      status,
      error: options?.error ?? null,
      stoppedAt: now(),
    })
    return true
  },
  async listExpiredTestSessions(cutoffs, limit, userId) {
    return [...store.testSessions.values()]
      .filter((s) => isUnfinishedSession(s) && sessionExpiry(s, cutoffs) !== null)
      .filter((s) => userId === undefined || s.userId === userId)
      .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
      .slice(0, limit)
      .map((session) => ({ session, expiry: sessionExpiry(session, cutoffs) }))
  },

  async listUnfinishedTestSessionsForWorkflow(workflowId) {
    return [...store.testSessions.values()]
      .filter((s) => s.workflowId === workflowId && isUnfinishedSession(s))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
  async markTestSessionRuntimeAbandoned(runtime, error) {
    const abandoned = [...store.testSessions.values()].filter(
      (s) => s.runtime === runtime && isUnfinishedSession(s),
    )
    for (const session of abandoned) {
      store.testSessions.set(session.id, {
        ...session,
        status: 'failed',
        error,
        stoppedAt: now(),
      })
    }
    return abandoned
  },

  // Deployment configs (one per workflow + connection)
  async getDeploymentConfig(workflowId, connectionId) {
    return store.deploymentConfigs.get(`${workflowId}|${connectionId}`) ?? null
  },
  async upsertDeploymentConfig(data) {
    const key = `${data.workflowId}|${data.connectionId}`
    const existing = store.deploymentConfigs.get(key)
    const row = {
      id: existing?.id ?? data.id,
      workflowId: data.workflowId,
      connectionId: data.connectionId,
      provider: data.provider,
      config: data.config,
      updatedBy: data.updatedBy ?? null,
      updatedAt: now(),
    } satisfies DeploymentConfig
    store.deploymentConfigs.set(key, row)
    return row
  },
  async listDeploymentConfigsByWorkflow(workflowId) {
    return [...store.deploymentConfigs.values()].filter((c) => c.workflowId === workflowId)
  },
  async deleteDeploymentConfig(workflowId, connectionId) {
    store.deploymentConfigs.delete(`${workflowId}|${connectionId}`)
  },

  // Deployments
  async createDeployment(data) {
    const d: Deployment = {
      ...data,
      versionId: data.versionId ?? null,
      connectionId: data.connectionId ?? null,
      serviceUrl: data.serviceUrl ?? null,
      error: data.error ?? null,
      configSnapshot: data.configSnapshot ?? null,
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
    // Mirrors the real query: inner join on the version (a deployment whose
    // version is gone drops out), newest first, and the later-inserted row
    // wins a tie in createdAt — picking the first match answered for the
    // oldest deployment instead.
    const candidate = [...store.deployments.values()]
      .filter((d) => d.workflowId === workflowId && d.status === 'success')
      .filter((d) => d.versionId !== null && store.versions.has(d.versionId))
      .reverse()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!candidate?.versionId) return false
    return store.versions.get(candidate.versionId)?.locked === 1
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

  // API Keys — mirrors the adapter: create validates the project belongs to
  // the organization and stores exactly one level; auth resolves the org from
  // either source and checks the creator's membership; the org listing never
  // crosses organizations.
  async createApiKey(data) {
    if (data.projectId) {
      const project = store.projects.get(data.projectId)
      if (!project || project.organizationId !== data.organizationId) return null
    }
    const key: ApiKey = {
      ...data,
      projectId: data.projectId ?? null,
      organizationId: data.projectId ? null : data.organizationId,
      expiresAt: data.expiresAt ?? null,
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
  async getApiKeyAuthByHash(keyHash) {
    const key =
      [...store.apiKeys.values()].find((k) => k.keyHash === keyHash && !k.revokedAt) ?? null
    if (!key) return null
    const projectOrg = key.projectId
      ? (store.projects.get(key.projectId)?.organizationId ?? null)
      : null
    const resolvedOrganizationId = key.organizationId ?? projectOrg
    return {
      ...key,
      resolvedOrganizationId,
      // The same membership rule as the isOrgMember mock above.
      createdByIsMember: key.createdBy === TEST_USER_ID && resolvedOrganizationId === TEST_ORG_ID,
    }
  },
  async listApiKeysByOrganization(organizationId) {
    return {
      data: [...store.apiKeys.values()].filter((k) => {
        const org =
          k.organizationId ??
          (k.projectId ? (store.projects.get(k.projectId)?.organizationId ?? null) : null)
        return org === organizationId
      }),
      nextCursor: null,
    }
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
  async revokeApiKey(id, organizationId) {
    const k = store.apiKeys.get(id)
    if (!k) return null
    const keyOrg =
      k.organizationId ??
      (k.projectId ? (store.projects.get(k.projectId)?.organizationId ?? null) : null)
    if (keyOrg !== organizationId) return null
    const revoked = { ...k, revokedAt: now() }
    store.apiKeys.set(id, revoked)
    return revoked
  },

  // Env Vars — store-backed, mirroring the real adapter's org validation on
  // create and its org-wide (projectId IS NULL) vs per-project list split.
  async createEnvVar(data) {
    if (data.projectId) {
      const project = store.projects.get(data.projectId)
      if (!project || project.organizationId !== data.organizationId) return null
    }
    const row: EnvVar = {
      ...data,
      projectId: data.projectId ?? null,
      isSecret: data.isSecret,
      createdAt: now(),
      updatedAt: now(),
    }
    store.envVars.set(row.id, row)
    return row
  },
  async getEnvVarById(id) {
    return store.envVars.get(id) ?? null
  },
  async listEnvVarsByOrganization(organizationId) {
    return {
      data: [...store.envVars.values()].filter(
        (v) => v.organizationId === organizationId && v.projectId === null,
      ),
      nextCursor: null,
    }
  },
  async listEnvVarsByProject(organizationId, projectId) {
    return {
      data: [...store.envVars.values()].filter(
        (v) => v.organizationId === organizationId && v.projectId === projectId,
      ),
      nextCursor: null,
    }
  },
  async updateEnvVar(id, scope, data) {
    const v = store.envVars.get(id)
    if (!v || !envVarInScope(v, scope)) return null
    // Mirrors the adapter's reveal guard: a stored secret cannot become
    // readable by flipping the flag without a replacement value.
    if (data.isSecret === false && data.value === undefined && v.isSecret) return null
    const updated = { ...v, ...data, updatedAt: now() }
    store.envVars.set(id, updated)
    return updated
  },
  async deleteEnvVar(id, scope) {
    const v = store.envVars.get(id)
    if (!v || !envVarInScope(v, scope)) return false
    return store.envVars.delete(id)
  },
  async getWorkflowEnvVars() {
    return []
  },
  async setWorkflowEnvVars() {},
  async findEnvVarsByNames() {
    return []
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

/**
 * Fixture escape hatch: a workflow's `kind` is fixed at creation and cannot be
 * changed through the adapter's update path, so tests that need an existing
 * fixture to be a script set it here.
 */
export function setWorkflowKind(id: string, kind: 'workflow' | 'script') {
  const workflow = store.workflows.get(id)
  if (!workflow) throw new Error(`No workflow ${id} in the test store`)
  store.workflows.set(id, { ...workflow, kind })
}

export { mockDb, mockAuth }

/**
 * A runner that records what it was asked to do. Every lifecycle decision —
 * what gets started, what gets stopped, in which order — is visible here, so
 * the route tests assert on the protocol rather than on a container.
 */
export class FakeTestSessionRunner implements TestSessionRunner {
  readonly runtime = 'node' as const
  started: string[] = []
  stopped: string[] = []
  triggers: { sessionId: string; payload: unknown }[] = []
  failStart: string | null = null
  logs_: ProcessLogEntry[] = []

  containerId(sessionId: string) {
    return `fake-${sessionId}`
  }

  async start(_bundle: GeneratedBundle, target: TestSessionTarget) {
    if (this.failStart) throw new Error(this.failStart)
    this.started.push(target.sessionId)
    return { processId: `pid-${target.sessionId}`, port: 8800 }
  }

  async trigger(handle: StartedTestSessionHandle, payload: unknown) {
    this.triggers.push({ sessionId: handle.sessionId, payload })
    return { status: 200, body: { instanceId: 'inst-1' } }
  }

  async instanceStatus() {
    return { status: 200, body: { status: 'complete' } }
  }

  async logs(_handle: StartedTestSessionHandle, after?: string) {
    const seen = Number(after ?? 0)
    return { entries: this.logs_.slice(seen), cursor: String(this.logs_.length) }
  }

  async stop(handle: { sessionId: string }) {
    this.stopped.push(handle.sessionId)
  }
}

export function createTestApp(options?: {
  remoteNodeRegistry?: AppDeps['remoteNodeRegistry']
  testSessionRunner?: AppDeps['testSessionRunner']
  testSessionLimits?: AppDeps['testSessionLimits']
  /** A concrete origin turns CSRF checking on, as a deployment has it. */
  corsOrigin?: AppDeps['corsOrigin']
}) {
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
    corsOrigin: options?.corsOrigin ?? '*',
    isDev: true,
    remoteNodeRegistry: options?.remoteNodeRegistry,
    testSessionRunner: options?.testSessionRunner,
    testSessionLimits: options?.testSessionLimits,
  })
}
