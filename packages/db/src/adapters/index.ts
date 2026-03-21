import { eq, and, desc } from 'drizzle-orm'
import type { DatabaseAdapter, WorkflowEnvVar, ResolvedEnvVar } from '../adapter.js'
import type { Workflow, WorkflowVersion, Connection, WorkflowRun, Deployment, ApiKey, EnvVar } from '../types.js'
import type { TokenCrypto } from '../crypto.js'
import { WorkflowsAdapter } from './workflows.js'
import { VersionsAdapter } from './versions.js'
import { ConnectionsAdapter } from './connections.js'
import { RunsAdapter } from './runs.js'
import { DeploymentsAdapter } from './deployments.js'
import { ApiKeysAdapter } from './api-keys.js'
import { EnvVarsAdapter } from './env-vars.js'

export interface SchemaRef {
  workflows: unknown
  workflowVersions: unknown
  connections: unknown
  workflowRuns: unknown
  deployments: unknown
  apiKeys: unknown
  envVars: unknown
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
    this._envVars = new EnvVarsAdapter(db, schema.envVars, options?.tokenCrypto)
  }

  createWorkflow(data: { id: string; userId: string; name: string; description?: string }): Promise<Workflow> {
    return this._workflows.create(data)
  }
  getWorkflowById(id: string): Promise<Workflow | null> {
    return this._workflows.getById(id)
  }
  listWorkflowsByUser(userId: string): Promise<Workflow[]> {
    return this._workflows.listByUser(userId)
  }
  updateWorkflow(id: string, data: { name?: string; description?: string; currentVersionId?: string | null; envVars?: string | null; triggerCode?: string | null; dependencies?: string | null }): Promise<Workflow> {
    return this._workflows.update(id, data)
  }
  deleteWorkflow(id: string): Promise<void> {
    return this._workflows.delete(id)
  }

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

  createConnection(data: { id: string; userId: string; provider: string; credentials: string; name: string }): Promise<Connection> {
    return this._connections.create(data)
  }
  getProviderConnectionById(id: string): Promise<Connection | null> {
    return this._connections.getById(id)
  }
  listConnectionsByUser(userId: string): Promise<Connection[]> {
    return this._connections.listByUser(userId)
  }
  updateConnection(id: string, data: { name?: string; credentials?: string }): Promise<Connection | null> {
    return this._connections.update(id, data)
  }
  deleteConnection(id: string): Promise<void> {
    return this._connections.delete(id)
  }

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

  async listRecentRunsByUser(userId: string, limit = 20): Promise<WorkflowRun[]> {
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
      .where(eq(w.userId, userId))
      .orderBy(desc(r.createdAt))
      .limit(limit)
  }

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

  async listRecentDeploymentsByUser(userId: string, limit = 20): Promise<Deployment[]> {
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
      .where(eq(w.userId, userId))
      .orderBy(desc(d.createdAt))
      .limit(limit)
  }

  deleteDeploymentsByWorkflow(workflowId: string): Promise<void> {
    return this._deployments.deleteByWorkflow(workflowId)
  }

  createApiKey(data: { id: string; userId: string; name: string; keyHash: string; keyPrefix: string; scopes: string; expiresAt?: string | null }): Promise<ApiKey> {
    return this._apiKeys.create(data)
  }
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    return this._apiKeys.getByHash(keyHash)
  }
  listApiKeysByUser(userId: string): Promise<ApiKey[]> {
    return this._apiKeys.listByUser(userId)
  }
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void> {
    return this._apiKeys.updateLastUsed(id, lastUsedAt)
  }
  revokeApiKey(id: string, userId: string): Promise<ApiKey | null> {
    return this._apiKeys.revoke(id, userId)
  }

  createEnvVar(data: { id: string; userId: string; name: string; value: string; isSecret: boolean }): Promise<EnvVar> {
    return this._envVars.create(data)
  }
  getEnvVarById(id: string): Promise<EnvVar | null> {
    return this._envVars.getById(id)
  }
  listGlobalEnvVars(userId: string): Promise<EnvVar[]> {
    return this._envVars.listByUser(userId)
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

  async resolveEnvVars(userId: string, workflowId: string): Promise<Record<string, ResolvedEnvVar>> {
    const workflowVars = await this.getWorkflowEnvVars(workflowId)
    const globalRefPattern = /^\{\{global\.env\.([A-Z][A-Z0-9_]*)\}\}$/
    const result: Record<string, ResolvedEnvVar> = {}

    for (const wVar of workflowVars) {
      const match = wVar.value.match(globalRefPattern)
      if (match) {
        const globalName = match[1]
        const globalVar = await this._envVars.getByUserAndName(userId, globalName)
        result[wVar.name] = globalVar
          ? { value: globalVar.value, isSecret: globalVar.isSecret }
          : { value: undefined, isSecret: wVar.isSecret }
      } else {
        result[wVar.name] = { value: wVar.value, isSecret: wVar.isSecret }
      }
    }

    return result
  }
}
