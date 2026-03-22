import { eq, and, desc, sql } from 'drizzle-orm'
import type { DatabaseAdapter, WorkflowEnvVar, ResolvedEnvVar, WorkflowWithStatus } from '../adapter.js'
import type { Workflow, WorkflowVersion, Connection, WorkflowRun, Deployment, ApiKey, EnvVar, Project } from '../types.js'
import type { TokenCrypto } from '../crypto.js'
import { WorkflowsAdapter } from './workflows.js'
import { VersionsAdapter } from './versions.js'
import { ConnectionsAdapter } from './connections.js'
import { RunsAdapter } from './runs.js'
import { DeploymentsAdapter } from './deployments.js'
import { ApiKeysAdapter } from './api-keys.js'
import { EnvVarsAdapter } from './env-vars.js'
import { ProjectsAdapter } from './projects.js'

export interface SchemaRef {
  workflows: unknown
  workflowVersions: unknown
  connections: unknown
  workflowRuns: unknown
  deployments: unknown
  apiKeys: unknown
  envVars: unknown
  projects: unknown
  member?: unknown
}

export interface DrizzleAdapterOptions {
  tokenCrypto?: TokenCrypto
}

export class DrizzleDatabaseAdapter implements DatabaseAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _db: any
  private _schema: SchemaRef
  private _workflows: WorkflowsAdapter
  private _versions: VersionsAdapter
  private _connections: ConnectionsAdapter
  private _runs: RunsAdapter
  private _deployments: DeploymentsAdapter
  private _apiKeys: ApiKeysAdapter
  private _envVars: EnvVarsAdapter
  private _projects: ProjectsAdapter

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, schema: SchemaRef, options?: DrizzleAdapterOptions) {
    this._db = db
    this._schema = schema
    this._workflows = new WorkflowsAdapter(db, schema.workflows)
    this._versions = new VersionsAdapter(db, schema.workflowVersions)
    this._connections = new ConnectionsAdapter(db, schema.connections, options?.tokenCrypto)
    this._runs = new RunsAdapter(db, schema.workflowRuns)
    this._deployments = new DeploymentsAdapter(db, schema.deployments)
    this._apiKeys = new ApiKeysAdapter(db, schema.apiKeys)
    this._envVars = new EnvVarsAdapter(db, schema.envVars, options?.tokenCrypto, schema.projects)
    this._projects = new ProjectsAdapter(db, schema.projects)
  }

  // Membership
  async isOrgMember(userId: string, organizationId: string): Promise<boolean> {
    if (!this._schema.member) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = this._schema.member as any
    const rows = await this._db
      .select({ id: m.id })
      .from(m)
      .where(and(eq(m.userId, userId), eq(m.organizationId, organizationId)))
      .limit(1)
    return rows.length > 0
  }

  async getProjectIfMember(userId: string, projectId: string): Promise<Project | null> {
    if (!this._schema.member) return this._projects.getById(projectId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = this._schema.projects as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = this._schema.member as any
    const rows = await this._db
      .select({
        id: p.id,
        organizationId: p.organizationId,
        name: p.name,
        slug: p.slug,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })
      .from(p)
      .innerJoin(m, and(eq(m.organizationId, p.organizationId), eq(m.userId, userId)))
      .where(eq(p.id, projectId))
      .limit(1)
    return rows[0] ?? null
  }

  // Projects
  createProject(data: { id: string; organizationId: string; name: string; slug: string; description?: string }): Promise<Project> {
    return this._projects.create(data)
  }
  getProjectById(id: string): Promise<Project | null> {
    return this._projects.getById(id)
  }
  listProjectsByOrganization(organizationId: string): Promise<Project[]> {
    return this._projects.listByOrganization(organizationId)
  }
  updateProject(id: string, data: { name?: string; slug?: string; description?: string }): Promise<Project> {
    return this._projects.update(id, data)
  }
  deleteProject(id: string): Promise<void> {
    return this._projects.delete(id)
  }

  // Workflows
  createWorkflow(data: { id: string; projectId: string; createdBy: string; name: string; description?: string }): Promise<Workflow> {
    return this._workflows.create(data)
  }
  getWorkflowById(id: string): Promise<Workflow | null> {
    return this._workflows.getById(id)
  }
  listWorkflowsByProject(projectId: string): Promise<Workflow[]> {
    return this._workflows.listByProject(projectId)
  }

  async listWorkflowsWithStatus(projectId: string): Promise<WorkflowWithStatus[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = this._schema.workflows as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = this._schema.deployments as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = this._schema.workflowRuns as any

    return this._db
      .select({
        id: w.id,
        projectId: w.projectId,
        createdBy: w.createdBy,
        name: w.name,
        description: w.description,
        currentVersionId: w.currentVersionId,
        envVars: w.envVars,
        triggerCode: w.triggerCode,
        dependencies: w.dependencies,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        deployStatus: sql<string | null>`(SELECT ${d.status} FROM ${d} WHERE ${d.workflowId} = ${w.id} ORDER BY ${d.createdAt} DESC LIMIT 1)`.as('deploy_status'),
        deployVersionId: sql<string | null>`(SELECT ${d.versionId} FROM ${d} WHERE ${d.workflowId} = ${w.id} ORDER BY ${d.createdAt} DESC LIMIT 1)`.as('deploy_version_id'),
        lastRunStatus: sql<string | null>`(SELECT ${r.status} FROM ${r} WHERE ${r.workflowId} = ${w.id} ORDER BY ${r.createdAt} DESC LIMIT 1)`.as('last_run_status'),
        lastRunAt: sql<string | null>`(SELECT ${r.createdAt} FROM ${r} WHERE ${r.workflowId} = ${w.id} ORDER BY ${r.createdAt} DESC LIMIT 1)`.as('last_run_at'),
      })
      .from(w)
      .where(eq(w.projectId, projectId))
      .orderBy(desc(w.updatedAt))
  }
  updateWorkflow(id: string, data: { name?: string; description?: string; currentVersionId?: string | null; envVars?: string | null; triggerCode?: string | null; dependencies?: string | null; projectId?: string }): Promise<Workflow> {
    return this._workflows.update(id, data)
  }
  deleteWorkflow(id: string): Promise<void> {
    return this._workflows.delete(id)
  }

  // Versions
  createVersion(data: { id: string; workflowId: string; version: number; ir: string; generatedCode?: string }): Promise<WorkflowVersion> {
    return this._versions.create(data)
  }
  getWorkflowVersionById(id: string): Promise<WorkflowVersion | null> {
    return this._versions.getById(id)
  }
  async getNextVersionNumber(workflowId: string): Promise<number> {
    const max = await this._versions.getMaxVersionNumber(workflowId)
    return max + 1
  }
  listVersionsByWorkflow(workflowId: string): Promise<WorkflowVersion[]> {
    return this._versions.listByWorkflow(workflowId)
  }
  updateVersion(id: string, data: { ir?: string; generatedCode?: string; locked?: number }): Promise<void> {
    return this._versions.update(id, data)
  }
  deleteVersion(id: string): Promise<void> {
    return this._versions.delete(id)
  }

  // Connections
  createConnection(data: { id: string; organizationId: string; createdBy: string; provider: string; credentials: string; name: string }): Promise<Connection> {
    return this._connections.create(data)
  }
  getProviderConnectionById(id: string): Promise<Connection | null> {
    return this._connections.getById(id)
  }
  listConnectionsByOrganization(organizationId: string): Promise<Connection[]> {
    return this._connections.listByOrganization(organizationId)
  }
  updateConnection(id: string, data: { name?: string; credentials?: string }): Promise<Connection | null> {
    return this._connections.update(id, data)
  }
  deleteConnection(id: string): Promise<void> {
    return this._connections.delete(id)
  }

  // Runs
  createRun(data: { id: string; workflowId: string; versionId: string; connectionId: string; instanceId: string; status: string }): Promise<WorkflowRun> {
    return this._runs.create(data)
  }
  getWorkflowRunById(id: string): Promise<WorkflowRun | null> {
    return this._runs.getById(id)
  }
  listRunsByWorkflow(workflowId: string): Promise<WorkflowRun[]> {
    return this._runs.listByWorkflow(workflowId)
  }
  updateRun(id: string, data: { status?: string; output?: string; error?: string }): Promise<WorkflowRun> {
    return this._runs.update(id, data)
  }

  async listRecentRunsByProject(projectId: string, limit = 20): Promise<WorkflowRun[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = this._schema.workflows as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = this._schema.workflowRuns as any
    return this._db
      .select({
        id: r.id,
        workflowId: r.workflowId,
        versionId: r.versionId,
        connectionId: r.connectionId,
        instanceId: r.instanceId,
        status: r.status,
        output: r.output,
        error: r.error,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
      .from(r)
      .innerJoin(w, eq(r.workflowId, w.id))
      .where(eq(w.projectId, projectId))
      .orderBy(desc(r.createdAt))
      .limit(limit)
  }

  // Deployments
  createDeployment(data: { id: string; workflowId: string; versionId: string; connectionId: string; serviceName: string; serviceUrl?: string; status: string; error?: string }): Promise<Deployment> {
    return this._deployments.create(data)
  }
  getActiveDeployment(workflowId: string): Promise<Deployment | null> {
    return this._deployments.getActiveByWorkflow(workflowId)
  }
  async isActiveDeploymentLocked(workflowId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = this._schema.deployments as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = this._schema.workflowVersions as any
    const rows = await this._db
      .select({ locked: v.locked })
      .from(d)
      .innerJoin(v, eq(d.versionId, v.id))
      .where(and(eq(d.workflowId, workflowId), eq(d.status, 'success')))
      .orderBy(desc(d.createdAt))
      .limit(1)
    return rows[0]?.locked === 1
  }
  listDeploymentsByWorkflow(workflowId: string): Promise<Deployment[]> {
    return this._deployments.listByWorkflow(workflowId)
  }

  async listRecentDeploymentsByProject(projectId: string, limit = 20): Promise<Deployment[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = this._schema.workflows as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = this._schema.deployments as any
    return this._db
      .select({
        id: d.id,
        workflowId: d.workflowId,
        versionId: d.versionId,
        connectionId: d.connectionId,
        serviceName: d.serviceName,
        serviceUrl: d.serviceUrl,
        status: d.status,
        error: d.error,
        createdAt: d.createdAt,
      })
      .from(d)
      .innerJoin(w, eq(d.workflowId, w.id))
      .where(eq(w.projectId, projectId))
      .orderBy(desc(d.createdAt))
      .limit(limit)
  }

  deleteDeploymentsByWorkflow(workflowId: string): Promise<void> {
    return this._deployments.deleteByWorkflow(workflowId)
  }

  // API Keys
  createApiKey(data: { id: string; projectId: string; createdBy: string; name: string; keyHash: string; keyPrefix: string; scopes: string; expiresAt?: string | null }): Promise<ApiKey> {
    return this._apiKeys.create(data)
  }
  getApiKeyById(id: string): Promise<ApiKey | null> {
    return this._apiKeys.getById(id)
  }
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    return this._apiKeys.getByHash(keyHash)
  }
  listApiKeysByProject(projectId: string): Promise<ApiKey[]> {
    return this._apiKeys.listByProject(projectId)
  }
  async listApiKeysByOrganization(organizationId: string): Promise<ApiKey[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = this._schema.apiKeys as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = this._schema.projects as any
    return this._db
      .select({
        id: k.id,
        projectId: k.projectId,
        createdBy: k.createdBy,
        name: k.name,
        keyHash: k.keyHash,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })
      .from(k)
      .innerJoin(p, eq(k.projectId, p.id))
      .where(eq(p.organizationId, organizationId))
      .orderBy(desc(k.createdAt))
  }
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void> {
    return this._apiKeys.updateLastUsed(id, lastUsedAt)
  }
  revokeApiKey(id: string, projectId: string): Promise<ApiKey | null> {
    return this._apiKeys.revoke(id, projectId)
  }

  // Env Vars
  createEnvVar(data: { id: string; organizationId: string; projectId?: string | null; createdBy: string; name: string; value: string; isSecret: boolean }): Promise<EnvVar | null> {
    return this._envVars.create(data)
  }
  getEnvVarById(id: string): Promise<EnvVar | null> {
    return this._envVars.getById(id)
  }
  listEnvVarsByOrganization(organizationId: string): Promise<EnvVar[]> {
    return this._envVars.listByOrganization(organizationId)
  }
  listEnvVarsByProject(organizationId: string, projectId: string): Promise<EnvVar[]> {
    return this._envVars.listByProject(organizationId, projectId)
  }
  updateEnvVar(id: string, data: { name?: string; value?: string; isSecret?: boolean }): Promise<EnvVar | null> {
    return this._envVars.update(id, data)
  }
  deleteEnvVar(id: string): Promise<void> {
    return this._envVars.delete(id)
  }

  async getWorkflowEnvVars(workflowId: string): Promise<WorkflowEnvVar[]> {
    const workflow = await this._workflows.getById(workflowId)
    if (!workflow?.envVars) return []
    try {
      return JSON.parse(workflow.envVars) as WorkflowEnvVar[]
    } catch {
      return []
    }
  }

  async setWorkflowEnvVars(workflowId: string, vars: WorkflowEnvVar[]): Promise<void> {
    await this._workflows.update(workflowId, { envVars: JSON.stringify(vars) })
  }

  async resolveEnvVars(organizationId: string, projectId: string, workflowId: string): Promise<Record<string, ResolvedEnvVar>> {
    const workflowVars = await this.getWorkflowEnvVars(workflowId)
    const globalRefPattern = /^\{\{global\.env\.([A-Z][A-Z0-9_]*)\}\}$/
    const result: Record<string, ResolvedEnvVar> = {}

    for (const wVar of workflowVars) {
      const match = wVar.value.match(globalRefPattern)
      if (match) {
        const globalName = match[1]
        // Try project-level first, then org-level (project overrides org)
        const projectVar = await this._envVars.getByOrgAndName(organizationId, globalName, projectId)
        const envVar = projectVar ?? await this._envVars.getByOrgAndName(organizationId, globalName)
        result[wVar.name] = envVar
          ? { value: envVar.value, isSecret: envVar.isSecret }
          : { value: undefined, isSecret: wVar.isSecret }
      } else {
        result[wVar.name] = { value: wVar.value, isSecret: wVar.isSecret }
      }
    }

    return result
  }
}
