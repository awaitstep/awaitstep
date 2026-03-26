import type {
  Workflow,
  WorkflowVersion,
  Connection,
  WorkflowRun,
  Deployment,
  ApiKey,
  EnvVar,
  Project,
} from './types.js'

export interface WorkflowWithStatus extends Workflow {
  deployStatus: string | null
  deployVersionId: string | null
  lastRunStatus: string | null
  lastRunAt: string | null
}

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
  // Membership
  isOrgMember(userId: string, organizationId: string): Promise<boolean>
  getProjectIfMember(userId: string, projectId: string): Promise<Project | null>

  // Projects
  createProject(data: {
    id: string
    organizationId: string
    name: string
    slug: string
    description?: string
  }): Promise<Project>
  getProjectById(id: string): Promise<Project | null>
  listProjectsByOrganization(organizationId: string): Promise<Project[]>
  updateProject(
    id: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<Project>
  deleteProject(id: string): Promise<void>

  // Workflows
  createWorkflow(data: {
    id: string
    projectId: string
    createdBy: string
    name: string
    description?: string
  }): Promise<Workflow>
  getWorkflowById(id: string): Promise<Workflow | null>
  listWorkflowsByProject(projectId: string): Promise<Workflow[]>
  listWorkflowsWithStatus(projectId: string): Promise<WorkflowWithStatus[]>
  updateWorkflow(
    id: string,
    data: {
      name?: string
      description?: string
      currentVersionId?: string | null
      envVars?: string | null
      triggerCode?: string | null
      dependencies?: string | null
      projectId?: string
    },
  ): Promise<Workflow>
  deleteWorkflow(id: string): Promise<void>

  // Workflow Versions
  createVersion(data: {
    id: string
    workflowId: string
    version: number
    ir: string
  }): Promise<WorkflowVersion>
  getWorkflowVersionById(id: string): Promise<WorkflowVersion | null>
  getNextVersionNumber(workflowId: string): Promise<number>
  listVersionsByWorkflow(workflowId: string): Promise<WorkflowVersion[]>
  updateVersion(id: string, data: { ir?: string; locked?: number }): Promise<void>
  deleteVersion(id: string): Promise<void>

  // Connections
  createConnection(data: {
    id: string
    organizationId: string
    createdBy: string
    provider: string
    credentials: string
    name: string
  }): Promise<Connection>
  getProviderConnectionById(id: string): Promise<Connection | null>
  listConnectionsByOrganization(organizationId: string): Promise<Connection[]>
  updateConnection(
    id: string,
    data: { name?: string; credentials?: string },
  ): Promise<Connection | null>
  deleteConnection(id: string): Promise<void>

  // Workflow Runs
  createRun(data: {
    id: string
    workflowId: string
    versionId: string
    connectionId: string
    instanceId: string
    status: string
  }): Promise<WorkflowRun>
  getWorkflowRunById(id: string): Promise<WorkflowRun | null>
  listRunsByWorkflow(workflowId: string): Promise<WorkflowRun[]>
  updateRun(
    id: string,
    data: { status?: string; output?: string; error?: string; updatedAt?: string },
  ): Promise<WorkflowRun>
  listRecentRunsByProject(projectId: string, limit?: number): Promise<WorkflowRun[]>

  // Deployments
  createDeployment(data: {
    id: string
    workflowId: string
    versionId: string
    connectionId: string
    serviceName: string
    serviceUrl?: string
    status: string
    error?: string
  }): Promise<Deployment>
  getActiveDeployment(workflowId: string): Promise<Deployment | null>
  isActiveDeploymentLocked(workflowId: string): Promise<boolean>
  listDeploymentsByWorkflow(workflowId: string): Promise<Deployment[]>
  listRecentDeploymentsByProject(projectId: string, limit?: number): Promise<Deployment[]>
  deleteDeploymentsByWorkflow(workflowId: string): Promise<void>

  // API Keys
  createApiKey(data: {
    id: string
    projectId: string
    createdBy: string
    name: string
    keyHash: string
    keyPrefix: string
    scopes: string
    expiresAt?: string | null
  }): Promise<ApiKey>
  getApiKeyById(id: string): Promise<ApiKey | null>
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>
  listApiKeysByProject(projectId: string): Promise<ApiKey[]>
  listApiKeysByOrganization(organizationId: string): Promise<ApiKey[]>
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void>
  revokeApiKey(id: string, projectId: string): Promise<ApiKey | null>

  // Environment Variables
  createEnvVar(data: {
    id: string
    organizationId: string
    projectId?: string | null
    createdBy: string
    name: string
    value: string
    isSecret: boolean
  }): Promise<EnvVar | null>
  getEnvVarById(id: string): Promise<EnvVar | null>
  listEnvVarsByOrganization(organizationId: string): Promise<EnvVar[]>
  listEnvVarsByProject(organizationId: string, projectId: string): Promise<EnvVar[]>
  updateEnvVar(
    id: string,
    data: { name?: string; value?: string; isSecret?: boolean },
  ): Promise<EnvVar | null>
  deleteEnvVar(id: string): Promise<void>
  getWorkflowEnvVars(workflowId: string): Promise<WorkflowEnvVar[]>
  setWorkflowEnvVars(workflowId: string, vars: WorkflowEnvVar[]): Promise<void>
  resolveEnvVars(
    organizationId: string,
    projectId: string,
    workflowId: string,
  ): Promise<Record<string, ResolvedEnvVar>>
}
