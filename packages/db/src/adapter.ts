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
  ApiKeyAuth,
  ApiKeyListItem,
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
  /** Updates only within the organization — null when no such row there. */
  updateProject(
    id: string,
    organizationId: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<Project | null>
  /** Deletes only within the organization — false when no such row there. */
  deleteProject(id: string, organizationId: string): Promise<boolean>

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

  // API Keys — exactly one of projectId / organizationId is stored per key
  // (schema CHECK): with projectId the key is project-level and must belong
  // to organizationId, without it the key is organization-level.
  /** Null when the project is not the organization's. */
  createApiKey(data: {
    id: string
    organizationId: string
    projectId?: string | null
    createdBy: string
    name: string
    keyHash: string
    keyPrefix: string
    scopes: string
    expiresAt?: string | null
  }): Promise<ApiKey | null>
  getApiKeyById(id: string): Promise<ApiKey | null>
  /**
   * The key, its organization (own or its project's) and whether its creator
   * is still a member there — one read.
   */
  getApiKeyAuthByHash(keyHash: string): Promise<ApiKeyAuth | null>
  /** One project's live keys; a foreign organization's project matches nothing. */
  listApiKeysByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>>
  /** The organization's live keys, both levels, with project names joined in. */
  listApiKeysByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>>
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void>
  /** Revokes within the organization — the key's own, or its project's. */
  revokeApiKey(id: string, organizationId: string): Promise<ApiKey | null>

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
  /**
   * Updates one statement-scoped row: the organization always, the project
   * when given (`null` = org-wide rows only). Null when no row matches — or
   * when the update would make a stored secret readable (isSecret flipped
   * false with no replacement value).
   */
  updateEnvVar(
    id: string,
    scope: { organizationId: string; projectId?: string | null },
    data: { name?: string; value?: string; isSecret?: boolean },
  ): Promise<EnvVar | null>
  /** Deletes within the scope — false when no row matched. */
  deleteEnvVar(
    id: string,
    scope: { organizationId: string; projectId?: string | null },
  ): Promise<boolean>
  getWorkflowEnvVars(workflowId: string): Promise<WorkflowEnvVar[]>
  setWorkflowEnvVars(workflowId: string, vars: WorkflowEnvVar[]): Promise<void>
  /**
   * Variables matching any of `names`, from the project and the org, in one
   * query. Resolving a `{{global.env.X}}` reference to a value is the
   * caller's job: the form of a reference is defined in `@awaitstep/ir`,
   * which this package is standalone from.
   */
  findEnvVarsByNames(
    organizationId: string,
    names: readonly string[],
    projectId?: string | null,
  ): Promise<EnvVar[]>

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
