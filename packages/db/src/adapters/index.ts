import type { DatabaseAdapter } from '../adapter.js'
import type { Workflow, WorkflowVersion, CFConnection, WorkflowRun, Deployment } from '../types.js'
import { WorkflowsAdapter } from './workflows.js'
import { VersionsAdapter } from './versions.js'
import { ConnectionsAdapter } from './connections.js'
import { RunsAdapter } from './runs.js'
import { DeploymentsAdapter } from './deployments.js'

export interface SchemaRef {
  workflows: unknown
  workflowVersions: unknown
  cfConnections: unknown
  workflowRuns: unknown
  deployments: unknown
}

export class DrizzleDatabaseAdapter implements DatabaseAdapter {
  private _workflows: WorkflowsAdapter
  private _versions: VersionsAdapter
  private _connections: ConnectionsAdapter
  private _runs: RunsAdapter
  private _deployments: DeploymentsAdapter

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, schema: SchemaRef) {
    this._workflows = new WorkflowsAdapter(db, schema.workflows)
    this._versions = new VersionsAdapter(db, schema.workflowVersions)
    this._connections = new ConnectionsAdapter(db, schema.cfConnections)
    this._runs = new RunsAdapter(db, schema.workflowRuns)
    this._deployments = new DeploymentsAdapter(db, schema.deployments)
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

  createConnection(data: { id: string; userId: string; accountId: string; apiToken: string; name: string }): Promise<CFConnection> {
    return this._connections.create(data)
  }
  getConnectionById(id: string): Promise<CFConnection | null> {
    return this._connections.getById(id)
  }
  listConnectionsByUser(userId: string): Promise<CFConnection[]> {
    return this._connections.listByUser(userId)
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

  createDeployment(data: { id: string; workflowId: string; versionId: string; connectionId: string; workerName: string; workerUrl?: string; status: string; error?: string }): Promise<Deployment> {
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
}
