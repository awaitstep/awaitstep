import type {
  Workflow,
  WorkflowVersion,
  Connection,
  WorkflowRun,
  RunStepsResult,
  UpsertRunStepData,
  ActiveRunForSync,
  Deployment,
  DeploymentConfig,
  ApiKey,
  EnvVar,
  Project,
  InstalledNode,
  CreateVersionData,
  UpdateVersionData,
  WorkflowFile,
  WorkflowFileSummary,
  UpsertWorkflowFileData,
  TestSession,
  TestSessionCutoffs,
  TestSessionStatus,
  TestSessionUsage,
  OwnedTestSession,
  ExpiringTestSession,
  ReserveTestSessionData,
  ReserveTestSessionLimits,
} from './types.js'
import type { PaginationParams, PaginatedResult } from './pagination.js'

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
  listProjectsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Project>>
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
    kind?: 'workflow' | 'script'
  }): Promise<Workflow>
  getWorkflowById(id: string): Promise<Workflow | null>
  listWorkflowsByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Workflow>>
  listWorkflowsWithStatus(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowWithStatus>>
  updateWorkflow(
    id: string,
    data: {
      name?: string
      description?: string
      currentVersionId?: string | null
      envVars?: string | null
      triggerCode?: string | null
      dependencies?: string | null
      deployConfig?: string | null
      projectId?: string
    },
  ): Promise<Workflow>
  deleteWorkflow(id: string): Promise<void>

  // Workflow Versions
  createVersion(data: CreateVersionData): Promise<WorkflowVersion>
  getWorkflowVersionById(id: string): Promise<WorkflowVersion | null>
  getNextVersionNumber(workflowId: string): Promise<number>
  listVersionsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowVersion>>
  updateVersion(id: string, data: UpdateVersionData): Promise<void>
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
  getProviderConnectionById(id: string, organizationId?: string): Promise<Connection | null>
  listConnectionsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Connection>>
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
  listRunsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowRun>>
  updateRun(
    id: string,
    data: { status?: string; output?: string; error?: string; updatedAt?: string },
  ): Promise<WorkflowRun>
  listRecentRunsByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowRun>>
  listActiveRunsForSync(limit?: number): Promise<ActiveRunForSync[]>
  getRunForSync(runId: string, workflowId: string): Promise<ActiveRunForSync | null>

  // Run steps (per-step telemetry)
  upsertRunSteps(runId: string, steps: UpsertRunStepData[]): Promise<void>
  listRunSteps(runId: string, workflowId: string): Promise<RunStepsResult>

  // Project files (user-authored modules/assets/config, folded into the IR at prepare)
  listWorkflowFiles(workflowId: string): Promise<WorkflowFile[]>
  /** Paths, hashes and sizes only — for listings and ownership checks. */
  listWorkflowFileSummaries(workflowId: string): Promise<WorkflowFileSummary[]>
  getWorkflowFile(workflowId: string, path: string): Promise<WorkflowFile | null>
  upsertWorkflowFile(data: UpsertWorkflowFileData): Promise<WorkflowFile>
  upsertWorkflowFiles(rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]>
  /** Insert only; null when the path already exists (the check is in the statement). */
  createWorkflowFile(data: UpsertWorkflowFileData): Promise<WorkflowFile | null>
  /** Conditional replace; `'*'` only requires existence. Null when nothing matched. */
  updateWorkflowFileIfMatches(
    data: UpsertWorkflowFileData,
    expectedHash: string,
  ): Promise<WorkflowFile | null>
  replaceWorkflowFiles(workflowId: string, rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]>
  deleteWorkflowFile(workflowId: string, path: string, expectedHash?: string): Promise<boolean>

  // Test sessions (disposable workers running a workflow before deploy)
  /**
   * Records a session as `starting` if both caps have room — the counts are
   * subqueries of the INSERT. Null when a cap was full.
   */
  reserveTestSession(
    data: ReserveTestSessionData,
    limits: ReserveTestSessionLimits,
  ): Promise<TestSession | null>
  /** Publishes the worker's process and port; null unless still `starting` and in time. */
  activateTestSession(
    id: string,
    userId: string,
    processId: string,
    port: number,
    cutoffs: TestSessionCutoffs,
  ): Promise<TestSession | null>
  /** Session + workflow + expiry, scoped to its owner and project in one statement. */
  getOwnedTestSession(
    id: string,
    userId: string,
    projectId: string,
    cutoffs: TestSessionCutoffs,
  ): Promise<OwnedTestSession | null>
  /** The user's newest live session for a workflow — never an expired one. */
  getLiveTestSessionForWorkflow(
    workflowId: string,
    userId: string,
    cutoffs: TestSessionCutoffs,
  ): Promise<TestSession | null>
  /** Concurrency (per user, all projects) and quota (per project), for refusal messages. */
  getTestSessionUsage(
    projectId: string,
    userId: string,
    quotaWindowStart: string,
  ): Promise<TestSessionUsage>
  /** Bumps the idle clock; false once the session is expired, finished or not theirs. */
  touchTestSession(id: string, userId: string, cutoffs: TestSessionCutoffs): Promise<boolean>
  /** False when another writer already finished it (the transition is in the statement). */
  markTestSessionStopped(
    id: string,
    status: Extract<TestSessionStatus, 'stopped' | 'failed'>,
    options?: { userId?: string; error?: string },
  ): Promise<boolean>
  /** Sessions past a cut-off, oldest first, with reasons; one user's when given. */
  listExpiredTestSessions(
    cutoffs: TestSessionCutoffs,
    limit: number,
    userId?: string,
  ): Promise<ExpiringTestSession[]>
  /** Every unfinished session for a workflow, whoever started it. */
  listUnfinishedTestSessionsForWorkflow(workflowId: string): Promise<TestSession[]>
  /** Writes off a runtime's sessions without touching their workers (boot cleanup). */
  markTestSessionRuntimeAbandoned(
    runtime: TestSession['runtime'],
    error: string,
  ): Promise<TestSession[]>

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
    configSnapshot?: string
  }): Promise<Deployment>
  getActiveDeployment(workflowId: string): Promise<Deployment | null>
  isActiveDeploymentLocked(workflowId: string): Promise<boolean>
  listDeploymentsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Deployment>>
  listRecentDeploymentsByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Deployment>>
  deleteDeploymentsByWorkflow(workflowId: string): Promise<void>

  // Deployment Configs
  getDeploymentConfig(workflowId: string, connectionId: string): Promise<DeploymentConfig | null>
  upsertDeploymentConfig(data: {
    id: string
    workflowId: string
    connectionId: string
    provider: string
    config: string
    updatedBy?: string
  }): Promise<DeploymentConfig>
  listDeploymentConfigsByWorkflow(workflowId: string): Promise<DeploymentConfig[]>
  deleteDeploymentConfig(workflowId: string, connectionId: string): Promise<void>

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
  listApiKeysByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKey>>
  listApiKeysByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKey>>
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
  listEnvVarsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>>
  listEnvVarsByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>>
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

  // Installed Nodes (Marketplace)
  installNode(data: {
    id: string
    organizationId: string
    nodeId: string
    version: string
    bundle: string
    installedBy: string
  }): Promise<InstalledNode>
  uninstallNode(organizationId: string, nodeId: string): Promise<void>
  listInstalledNodes(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<InstalledNode>>
  getInstalledNode(organizationId: string, nodeId: string): Promise<InstalledNode | null>
  updateInstalledNodeBundle(
    organizationId: string,
    nodeId: string,
    data: { version: string; bundle: string },
  ): Promise<InstalledNode>
}
