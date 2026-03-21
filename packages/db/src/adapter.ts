import type { Workflow, WorkflowVersion, Connection, WorkflowRun, Deployment, ApiKey, EnvVar } from './types.js'

export interface WorkflowEnvVar {
  name: string
  value: string
  isSecret: boolean
}

export interface ResolvedEnvVar {
  value: string | undefined
  isSecret: boolean
}

export interface DatabaseAdapter {
  // Workflows
  createWorkflow(data: { id: string; userId: string; name: string; description?: string }): Promise<Workflow>
  getWorkflowById(id: string): Promise<Workflow | null>
  listWorkflowsByUser(userId: string): Promise<Workflow[]>
  updateWorkflow(id: string, data: { name?: string; description?: string; currentVersionId?: string | null; envVars?: string | null; triggerCode?: string | null; dependencies?: string | null }): Promise<Workflow>
  deleteWorkflow(id: string): Promise<void>

  // Workflow Versions
  createVersion(data: { id: string; workflowId: string; version: number; ir: string; generatedCode?: string }): Promise<WorkflowVersion>
  getWorkflowVersionById(id: string): Promise<WorkflowVersion | null>
  getNextVersionNumber(workflowId: string): Promise<number>
  listVersionsByWorkflow(workflowId: string): Promise<WorkflowVersion[]>
  updateVersion(id: string, data: { ir?: string; generatedCode?: string; locked?: number }): Promise<void>
  deleteVersion(id: string): Promise<void>

  // Connections
  createConnection(data: { id: string; userId: string; provider: string; credentials: string; name: string }): Promise<Connection>
  getProviderConnectionById(id: string): Promise<Connection | null>
  listConnectionsByUser(userId: string): Promise<Connection[]>
  updateConnection(id: string, data: { name?: string; credentials?: string }): Promise<Connection | null>
  deleteConnection(id: string): Promise<void>

  // Workflow Runs
  createRun(data: { id: string; workflowId: string; versionId: string; connectionId: string; instanceId: string; status: string }): Promise<WorkflowRun>
  getWorkflowRunById(id: string): Promise<WorkflowRun | null>
  listRunsByWorkflow(workflowId: string): Promise<WorkflowRun[]>
  updateRun(id: string, data: { status?: string; output?: string; error?: string; updatedAt?: string }): Promise<WorkflowRun>
  listRecentRunsByUser(userId: string, limit?: number): Promise<WorkflowRun[]>

  // Deployments
  createDeployment(data: { id: string; workflowId: string; versionId: string; connectionId: string; serviceName: string; serviceUrl?: string; status: string; error?: string }): Promise<Deployment>
  getActiveDeployment(workflowId: string): Promise<Deployment | null>
  isActiveDeploymentLocked(workflowId: string): Promise<boolean>
  listDeploymentsByWorkflow(workflowId: string): Promise<Deployment[]>
  listRecentDeploymentsByUser(userId: string, limit?: number): Promise<Deployment[]>
  deleteDeploymentsByWorkflow(workflowId: string): Promise<void>

  // API Keys
  createApiKey(data: { id: string; userId: string; name: string; keyHash: string; keyPrefix: string; scopes: string; expiresAt?: string | null }): Promise<ApiKey>
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>
  listApiKeysByUser(userId: string): Promise<ApiKey[]>
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void>
  revokeApiKey(id: string, userId: string): Promise<ApiKey | null>

  // Environment Variables
  createEnvVar(data: { id: string; userId: string; name: string; value: string; isSecret: boolean }): Promise<EnvVar>
  getEnvVarById(id: string): Promise<EnvVar | null>
  listGlobalEnvVars(userId: string): Promise<EnvVar[]>
  updateEnvVar(id: string, data: { name?: string; value?: string; isSecret?: boolean }): Promise<EnvVar | null>
  deleteEnvVar(id: string): Promise<void>
  getWorkflowEnvVars(workflowId: string): Promise<WorkflowEnvVar[]>
  setWorkflowEnvVars(workflowId: string, vars: WorkflowEnvVar[]): Promise<void>
  resolveEnvVars(userId: string, workflowId: string): Promise<Record<string, ResolvedEnvVar>>
}
