import type { Workflow, WorkflowVersion, CFConnection, WorkflowRun, Deployment } from './types.js'

export interface DatabaseAdapter {
  // Workflows
  createWorkflow(data: { id: string; userId: string; name: string; description?: string }): Promise<Workflow>
  getWorkflowById(id: string): Promise<Workflow | null>
  listWorkflowsByUser(userId: string): Promise<Workflow[]>
  updateWorkflow(id: string, data: { name?: string; description?: string; currentVersionId?: string | null }): Promise<Workflow>
  deleteWorkflow(id: string): Promise<void>

  // Workflow Versions
  createVersion(data: { id: string; workflowId: string; version: number; ir: string; generatedCode?: string }): Promise<WorkflowVersion>
  getVersionById(id: string): Promise<WorkflowVersion | null>
  listVersionsByWorkflow(workflowId: string): Promise<WorkflowVersion[]>

  // CF Connections
  createConnection(data: { id: string; userId: string; accountId: string; apiToken: string; name: string }): Promise<CFConnection>
  getConnectionById(id: string): Promise<CFConnection | null>
  listConnectionsByUser(userId: string): Promise<CFConnection[]>
  deleteConnection(id: string): Promise<void>

  // Workflow Runs
  createRun(data: { id: string; workflowId: string; versionId: string; connectionId: string; instanceId: string; status: string }): Promise<WorkflowRun>
  getRunById(id: string): Promise<WorkflowRun | null>
  listRunsByWorkflow(workflowId: string): Promise<WorkflowRun[]>
  updateRun(id: string, data: { status?: string; output?: string; error?: string }): Promise<WorkflowRun>

  // Deployments
  createDeployment(data: { id: string; workflowId: string; versionId: string; connectionId: string; workerName: string; workerUrl?: string; status: string; error?: string }): Promise<Deployment>
  listDeploymentsByWorkflow(workflowId: string): Promise<Deployment[]>
  listRecentDeploymentsByUser(userId: string, limit?: number): Promise<Deployment[]>
}
