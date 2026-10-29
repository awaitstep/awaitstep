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
  Workspace,
  WorkspaceOverview,
  WorkspaceIds,
  WorkspaceRef,
  WorkspaceInProjectRef,
  ProjectRef,
  ProjectOverview,
  OrgOverview,
  ScopeRows,
  ScopeSlugs,
  CreateWorkspaceData,
  UpdateWorkspaceData,
  WorkspaceRunFilter,
  WorkspaceRunPage,
  FailingWorkflow,
  MemberRole,
  ProjectAccess,
  WorkspaceAccess,
  WorkflowAccess,
  WorkspaceGrant,
  WorkspaceGrantData,
  WorkspaceMember,
  WorkspacePersonRow,
  ProjectMemberRow,
  OrgMemberRow,
  PersonAccessRows,
  AccessGrantData,
  InOrgCheck,
  GrantRows,
  CreateInvitationData,
  InvitationChecks,
  InvitationRow,
  InvitationView,
  PendingInvitationRow,
  AcceptInvitationData,
  AccessRequestRow,
  AccessRequestDecision,
} from './types.js'
import type { PaginationParams, PaginatedResult } from './pagination.js'

export interface WorkflowWithStatus extends Workflow {
  deployStatus: string | null
  deployVersionId: string | null
  /** The version number the latest deployment put live, null for drafts. */
  deployedVersion: number | null
  lastRunStatus: string | null
  lastRunAt: string | null
  /** The statuses of the last ten finished runs, newest first. */
  recentRunStatuses: string[]
}

export interface WorkflowListFilter {
  workspaceId?: string
  kind?: 'workflow' | 'script'
  /** Without a workspace: only workflows in workspaces this person can open. */
  visibleTo?: string
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
  // Membership and scope — each a single JOIN; a row the caller may not open
  // reads as null, exactly like one that does not exist.
  isOrgMember(userId: string, organizationId: string): Promise<boolean>
  getOrganizationIfMember(
    userId: string,
    ref: { id: string } | { slug: string },
  ): Promise<({ id: string; slug: string } & MemberRole) | null>
  /**
   * The project if the caller can open it, with their membership rows; with
   * `workspace`, null unless that workspace is the project's and theirs to open.
   */
  getProjectIfMember(
    userId: string,
    ref: ProjectRef,
    workspace?: WorkspaceInProjectRef,
  ): Promise<ProjectAccess | null>
  getWorkspaceIfMember(userId: string, ref: WorkspaceRef): Promise<WorkspaceAccess | null>
  /** A workspace of a project, by id or slug, with no visibility check (a key's project pin). */
  getWorkspaceInProject(projectId: string, ref: WorkspaceInProjectRef): Promise<WorkspaceIds | null>
  /** The workflow with the caller's rows in its workspace, if they can open that workspace. */
  getWorkflowForUser(userId: string, workflowId: string): Promise<WorkflowAccess | null>
  listOrganizationsForMember(userId: string): Promise<OrgOverview[]>
  /** What `/{org}/{project}/{workspace}` names, with each level's counts and lists. */
  /** `now` is the clock for the 24-hour run counts. */
  getScopeBySlugs(userId: string, slugs: ScopeSlugs, now?: Date): Promise<ScopeRows | null>

  // Projects
  /** Creates the project and its Default workspace together: both rows, or neither. */
  createProject(data: {
    id: string
    organizationId: string
    name: string
    slug: string
    description?: string
    defaultWorkspaceId: string
    createdBy?: string | null
  }): Promise<{ project: Project; workspace: Workspace }>
  getProjectById(id: string): Promise<Project | null>
  /** Every project in the organization, seen or not: deleting the organization waits for them. */
  countProjectsInOrganization(organizationId: string): Promise<number>
  /** The projects the user can open, with workspaces, health and people as they may see them. */
  listProjectsByOrganization(
    organizationId: string,
    userId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ProjectOverview>>
  /**
   * Moves the project, as one unit, if the mover runs the target organization
   * (checked in the statement): open invitations' places into it and grants
   * held by people outside the target go. Nothing says whether it moved —
   * `getProjectById` afterwards does — and a slug the target already uses
   * surfaces as `isUniqueViolation`.
   */
  moveProjectToOrganization(
    projectId: string,
    fromOrganizationId: string,
    toOrganizationId: string,
    moverId: string,
  ): Promise<void>
  /** Updates only within the organization — null when no such row there. */
  updateProject(
    id: string,
    organizationId: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<Project | null>
  /** Deletes only within the organization — false when no such row there. */
  deleteProject(id: string, organizationId: string): Promise<boolean>

  // Workspaces
  /** The project's workspaces the user can open, with counts and people. */
  listWorkspacesByProject(projectId: string, userId: string): Promise<WorkspaceOverview[]>
  /**
   * Null when the slug is taken in the project (checked in the statement).
   * With `members`, they are written in the same unit; the caller checked
   * they are in the organization.
   */
  createWorkspace(
    data: CreateWorkspaceData,
    members?: { userId: string; role: WorkspaceGrant }[],
  ): Promise<Workspace | null>
  getWorkspaceById(id: string): Promise<Workspace | null>
  /** Null when gone, or when a given slug is a sibling's. */
  updateWorkspace(id: string, data: UpdateWorkspaceData): Promise<Workspace | null>
  /** False when it is the project's last workspace (checked in the statement) or gone. */
  deleteWorkspaceUnlessLast(id: string): Promise<boolean>
  /** The ids that moved; a target outside the source's project moves none. */
  moveWorkflowsToWorkspace(
    fromWorkspaceId: string,
    toWorkspaceId: string,
    workflowIds: string[],
  ): Promise<string[]>
  listWorkspaceRuns(workspaceId: string, filter: WorkspaceRunFilter): Promise<WorkspaceRunPage>
  /** Across the organization's workspaces the viewer can open. */
  listFailingWorkflows(organizationId: string, viewerId: string): Promise<FailingWorkflow[]>

  // Access: people, grants and the access editor (B2). Reads are one
  // statement; a refusal is the statement's own WHERE matching nothing.
  /** Everyone in the organization and, for plain members, where they can work (in the viewer's projects). */
  listOrgMembers(organizationId: string, viewerId: string): Promise<OrgMemberRow[]>
  getPersonAccess(organizationId: string, userId: string): Promise<PersonAccessRows | null>
  /** One read of every check a write needs: which ids are the organization's, and one person's role in it. */
  checkInOrganization(
    organizationId: string,
    refs: { userId?: string; userIds?: string[]; projectIds?: string[]; workspaceIds?: string[] },
  ): Promise<InOrgCheck>
  /** False when no such member, or they are the only owner and `role` is not owner. */
  setOrgRole(organizationId: string, userId: string, role: string): Promise<boolean>
  /**
   * The org role and every project and workspace row of theirs in the
   * organization, replaced as one unit. A role change that would leave the
   * organization without an owner is refused and then nothing changes;
   * `getOrgRole` afterwards says whether it took.
   */
  saveAccess(
    organizationId: string,
    userId: string,
    grant: AccessGrantData,
    createdBy: string,
    caller: { callerIsOwner: boolean },
  ): Promise<void>
  /**
   * Removes them from the organization with every row of theirs and the
   * invitations they sent, as one unit — unless they are its only owner, or
   * an owner and the caller is not, when nothing changes (`getOrgRole`
   * afterwards says).
   */
  removeOrgMember(
    organizationId: string,
    userId: string,
    caller: { callerIsOwner: boolean },
  ): Promise<void>
  listWorkspacePeople(workspaceId: string): Promise<WorkspacePersonRow[]>
  listProjectMembers(projectId: string, viewerId: string): Promise<ProjectMemberRow[]>
  /** The rows behind one person's standing in a workspace; null for an unknown workspace. */
  getGrantRows(workspaceId: string, userId: string): Promise<GrantRows | null>
  /** Null when they are outside the org, already in, or the role is at or below what the project gives. */
  addWorkspaceMember(data: WorkspaceGrantData): Promise<WorkspaceMember | null>
  /** Null when there is no grant, or the role is at or below what the project gives. */
  setWorkspaceGrant(
    workspaceId: string,
    userId: string,
    role: WorkspaceGrant,
  ): Promise<WorkspaceMember | null>
  removeWorkspaceGrant(workspaceId: string, userId: string): Promise<boolean>
  getOrgRole(organizationId: string, userId: string): Promise<string | null>

  // Invitations (storage is better-auth's table; the lifecycle is this API's)
  /** One read of every check inviting needs: which ids are the organization's, which addresses are taken. */
  invitationChecks(
    organizationId: string,
    refs: { projectIds: string[]; workspaceIds: string[]; emails: string[]; now: string },
  ): Promise<InvitationChecks>
  createInvitations(invitations: CreateInvitationData[]): Promise<void>
  /** Open, unexpired ones, with places in the projects the viewer can open. */
  listInvitations(organizationId: string, viewerId: string, now: string): Promise<InvitationRow[]>
  getInvitation(id: string): Promise<InvitationView | null>
  /**
   * The member row if absent, the places as grants, the status — one unit,
   * all of it conditional on the invitation being open and unexpired now.
   */
  acceptInvitation(data: AcceptInvitationData): Promise<void>
  setInvitationStatus(id: string, from: string, to: string): Promise<boolean>
  /** Cancels an open or declined invitation of the organization; false when there is none to cancel. */
  cancelInvitation(id: string, organizationId: string): Promise<boolean>
  /** False when not pending, or sent more recently than `unlessExpiresAfter` allows. */
  resendInvitation(id: string, expiresAt: string, unlessExpiresAfter: string): Promise<boolean>
  /** False when they already asked. */
  askForNewInvitation(id: string, at: string): Promise<boolean>
  listInvitationsForEmail(email: string, now: string): Promise<PendingInvitationRow[]>

  // Access requests (a Viewer's "Ask for edit access")
  getOwnAccessRequest(workspaceId: string, userId: string): Promise<AccessRequestRow | null>
  /**
   * The person's open request here, made now (`created`) or found (the
   * guard is in the insert); addressed to the workspace's first admin by
   * name. Null when there is no one to ask and nothing open.
   */
  createAccessRequest(data: {
    id: string
    workspaceId: string
    userId: string
    now: string
  }): Promise<{ request: AccessRequestRow; created: boolean } | null>
  /** The request with the asker's rows and the decider's own, in one read. */
  getAccessRequestForDecision(id: string, deciderId: string): Promise<AccessRequestDecision | null>
  decideAccessRequest(data: {
    id: string
    status: 'approved' | 'declined'
    decidedBy: string
    now: string
    alreadyEditing: boolean
    grant: { workspaceId: string; userId: string } | null
  }): Promise<void>

  // Workflows
  /**
   * Into `workspaceId` when given (null when it is not the project's), else
   * into the project's oldest workspace.
   */
  createWorkflow(data: {
    id: string
    projectId: string
    workspaceId?: string | null
    createdBy: string
    name: string
    description?: string
    kind?: 'workflow' | 'script'
  }): Promise<Workflow | null>
  getWorkflowById(id: string): Promise<Workflow | null>
  listWorkflowsByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Workflow>>
  listWorkflowsWithStatus(
    projectId: string,
    pagination?: PaginationParams,
    filter?: WorkflowListFilter,
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
  /** Into the target project's oldest workspace, in one statement; null when nothing moved. */
  moveWorkflowToProject(id: string, targetProjectId: string): Promise<Workflow | null>

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
  /** With `visibleTo`, only runs of workflows in workspaces that person can open. */
  listRecentRunsByProject(
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
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
  /** With `visibleTo`, only deployments of workflows in workspaces that person can open. */
  listRecentDeploymentsByProject(
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
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
    parentKeyId?: string | null
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
  /** One project's live keys; a foreign organization's project, or one hidden from `visibleTo`, matches nothing. */
  listApiKeysByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
  ): Promise<PaginatedResult<ApiKeyListItem>>
  /** The organization's live keys, both levels, with project names joined in; project keys of projects hidden from `visibleTo` are left out. */
  listApiKeysByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
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
  /** One project's variables; a project hidden from `visibleTo` lists nothing. */
  listEnvVarsByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
  ): Promise<PaginatedResult<EnvVar>>
  /**
   * Updates one statement-scoped row: the organization always, the project
   * when given (`null` = org-wide rows only), and with `visibleTo` only a
   * row that is org-wide or in a project that person can open. Null when no
   * row matches — or when the update would make a stored secret readable
   * (isSecret flipped false with no replacement value).
   */
  updateEnvVar(
    id: string,
    scope: { organizationId: string; projectId?: string | null },
    data: { name?: string; value?: string; isSecret?: boolean },
    visibleTo?: string,
  ): Promise<EnvVar | null>
  /** Deletes within the scope (and, with `visibleTo`, what they can open) — false when no row matched. */
  deleteEnvVar(
    id: string,
    scope: { organizationId: string; projectId?: string | null },
    visibleTo?: string,
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
