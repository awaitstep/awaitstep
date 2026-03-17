import type { DatabaseAdapter } from '../adapter.js'
import type { Workflow, WorkflowVersion, Connection, WorkflowRun, Deployment, ApiKey } from '../types.js'
import type { TokenCrypto } from '../crypto.js'
import { WorkflowsAdapter } from './workflows.js'
import { VersionsAdapter } from './versions.js'
import { ConnectionsAdapter } from './connections.js'
import { RunsAdapter } from './runs.js'
import { DeploymentsAdapter } from './deployments.js'
import { ApiKeysAdapter } from './api-keys.js'

export interface SchemaRef {
  workflows: unknown
  workflowVersions: unknown
  connections: unknown
  workflowRuns: unknown
  deployments: unknown
  apiKeys: unknown
}

export interface DrizzleAdapterOptions {
  tokenCrypto?: TokenCrypto
}

export class DrizzleDatabaseAdapter implements DatabaseAdapter {
  private _workflows: WorkflowsAdapter
  private _versions: VersionsAdapter
  private _connections: ConnectionsAdapter
  private _runs: RunsAdapter
  private _deployments: DeploymentsAdapter
  private _apiKeys: ApiKeysAdapter

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, schema: SchemaRef, options?: DrizzleAdapterOptions) {
    this._workflows = new WorkflowsAdapter(db, schema.workflows)
    this._versions = new VersionsAdapter(db, schema.workflowVersions)
    this._connections = new ConnectionsAdapter(db, schema.connections, options?.tokenCrypto)
    this._runs = new RunsAdapter(db, schema.workflowRuns)
    this._deployments = new DeploymentsAdapter(db, schema.deployments)
    this._apiKeys = new ApiKeysAdapter(db, schema.apiKeys)
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
  updateWorkflow(id: string, data: { name?: string; description?: string; currentVersionId?: string | null }): Promise<Workflow> {
    return this._workflows.update(id, data)
  }
  deleteWorkflow(id: string): Promise<void> {
    return this._workflows.delete(id)
  }

  createVersion(data: { id: string; workflowId: string; version: number; ir: string; generatedCode?: string }): Promise<WorkflowVersion> {
    return this._versions.create(data)
  }
  getVersionById(id: string): Promise<WorkflowVersion | null> {
    return this._versions.getById(id)
  }
  listVersionsByWorkflow(workflowId: string): Promise<WorkflowVersion[]> {
    return this._versions.listByWorkflow(workflowId)
  }
  updateVersion(id: string, data: { ir?: string; generatedCode?: string }): Promise<void> {
    return this._versions.update(id, data)
  }

  createConnection(data: { id: string; userId: string; provider: string; credentials: string; name: string }): Promise<Connection> {
    return this._connections.create(data)
  }
  getConnectionById(id: string): Promise<Connection | null> {
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
  getRunById(id: string): Promise<WorkflowRun | null> {
    return this._runs.getById(id)
  }
  listRunsByWorkflow(workflowId: string): Promise<WorkflowRun[]> {
    return this._runs.listByWorkflow(workflowId)
  }
  updateRun(id: string, data: { status?: string; output?: string; error?: string }): Promise<WorkflowRun> {
    return this._runs.update(id, data)
  }

  async listRecentRunsByUser(userId: string, limit = 20): Promise<WorkflowRun[]> {
    const workflows = await this._workflows.listByUser(userId)
    const ids = workflows.map((w) => w.id)
    return this._runs.listByWorkflowIds(ids, limit)
  }

  createDeployment(data: { id: string; workflowId: string; versionId: string; connectionId: string; serviceName: string; serviceUrl?: string; status: string; error?: string }): Promise<Deployment> {
    return this._deployments.create(data)
  }
  listDeploymentsByWorkflow(workflowId: string): Promise<Deployment[]> {
    return this._deployments.listByWorkflow(workflowId)
  }

  async listRecentDeploymentsByUser(userId: string, limit = 20): Promise<Deployment[]> {
    const workflows = await this._workflows.listByUser(userId)
    const ids = workflows.map((w) => w.id)
    return this._deployments.listByWorkflowIds(ids, limit)
  }

  deleteDeploymentsByWorkflow(workflowId: string): Promise<void> {
    return this._deployments.deleteByWorkflow(workflowId)
  }

  createApiKey(data: { id: string; userId: string; name: string; keyHash: string; keyPrefix: string; scopes: string }): Promise<ApiKey> {
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
}
