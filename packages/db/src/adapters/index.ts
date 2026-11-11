import { eq, and, desc, or, lt, sql, aliasedTable } from 'drizzle-orm'
import type {
  DatabaseAdapter,
  WorkflowEnvVar,
  WorkflowListFilter,
  WorkflowWithStatus,
} from '../adapter.js'
import type {
  Workflow,
  WorkflowVersion,
  WorkflowVersionListItem,
  DeploymentListItem,
  Connection,
  DeployConfigLookup,
  DeployedConnection,
  VersionDeleteCheck,
  LatestVersionForSave,
  LiveDeploymentRow,
  ConnectionCoverage,
  ConnectionListOptions,
  ConnectionListRow,
  ConnectionRefresh,
  ConnectionTokenCheck,
  ConnectionUpdate,
  ConnectionWrite,
  ExpiringConnectionsCheck,
  AvailableConnectionRow,
  DeployTargetRow,
  ProjectConnectionCreate,
  ProjectConnectionRemoval,
  ProjectConnectionsRows,
  WorkspaceConnectionChange,
  NodeUsage,
  ProjectSetupCounts,
  WorkflowRun,
  RunStepsResult,
  UpsertRunStepData,
  ActiveRunForSync,
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
  Deployment,
  DeploymentConfig,
  ApiKey,
  ApiKeyAuth,
  ApiKeyListItem,
  ApiKeyScopedRows,
  ApiKeyScopeTarget,
  ApiKeyTarget,
  CreateApiKeyData,
  WorkspaceKeyCount,
  OrgHomeSummary,
  ProjectSummary,
  WorkspaceSettingsCounts,
  ResourceCounts,
  WorkflowPageSummary,
  WorkspacePageOverview,
  EnvVar,
  OrgEnvVar,
  ResolvedProjectVariable,
  ResolvedWorkspaceVariable,
  VariablePlace,
  Project,
  ProjectOverview,
  ProjectLocks,
  WorkspaceLocks,
  LockRow,
  SharingRow,
  SharedWorkflowRow,
  SharedWorkflowFilter,
  AuditEventInsert,
  NamedWorkspaceMember,
  NamedProjectMember,
  ProjectGrantData,
  ProjectGrantRows,
  ProjectMoveOutcome,
  PersonAuditInsert,
  AccountRow,
  AccountSessionRow,
  AccountExportRow,
  AuditListFilter,
  AuditEventPage,
  ExpiringKeysCheck,
  NotificationInsert,
  NotificationList,
  NotifiedRecipient,
  ReleaseVisitRow,
  FailureCount,
  ProjectRef,
  InstalledNode,
  CreateVersionData,
  UpdateVersionData,
  Workspace,
  WorkspaceOverview,
  WorkspaceIds,
  WorkspaceRef,
  WorkspaceInProjectRef,
  OrgListing,
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
  ImageInsert,
  ImageOwner,
  InlineImageRow,
  ServableImage,
} from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import type { TokenCrypto } from '../crypto.js'
import { is } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  type Dialect,
  aliasedFrom,
  fieldOf,
  jsonArrayOfValues,
  readJsonArray,
} from './json-array.js'
import { TERMINAL_RUN_STATUSES, type OverviewTables } from './overview-fields.js'
import { RoleFields } from './role-fields.js'
import { ScopeAdapter } from './scope.js'
import { SummaryAdapter } from './summaries.js'
import { AccessAdapter } from './access.js'
import { InvitationsAdapter } from './invitations.js'
import { AccessRequestsAdapter } from './access-requests.js'
import { WorkspacesAdapter } from './workspaces.js'
import { WorkspaceRunsAdapter } from './workspace-runs.js'
import { WorkflowsAdapter } from './workflows.js'
import { SharedWorkflowsAdapter } from './shared-workflows.js'
import { AuditAdapter } from './audit.js'
import { NotificationsAdapter } from './notifications.js'
import { VersionsAdapter } from './versions.js'
import { ConnectionsAdapter } from './connections.js'
import { ProjectConnectionsAdapter } from './project-connections.js'
import { RunsAdapter } from './runs.js'
import { RunStepsAdapter } from './run-steps.js'
import { WorkflowFilesAdapter } from './workflow-files.js'
import { TestSessionsAdapter } from './test-sessions.js'
import { DeploymentsAdapter } from './deployments.js'
import { ApiKeysAdapter } from './api-keys.js'
import { EnvVarsAdapter } from './env-vars.js'
import { ProjectsAdapter } from './projects.js'
import { InstalledNodesAdapter } from './installed-nodes.js'
import { DeploymentConfigsAdapter } from './deployment-configs.js'
import { AccountAdapter } from './account.js'
import { ImagesAdapter } from './images.js'

export interface SchemaRef {
  workflows: unknown
  workflowVersions: unknown
  connections: unknown
  connectionProjects?: unknown
  projectConnections?: unknown
  workspaceConnections?: unknown
  workflowRuns: unknown
  workflowRunSteps: unknown
  workflowFiles: unknown
  testSessions: unknown
  deployments: unknown
  deploymentConfigs: unknown
  apiKeys: unknown
  apiKeyProjects: unknown
  apiKeyWorkspaces: unknown
  envVars: unknown
  envVarWorkspaces: unknown
  envVarProjects: unknown
  projects: unknown
  workspaces: unknown
  installedNodes: unknown
  member?: unknown
  organization?: unknown
  user?: unknown
  session?: unknown
  account?: unknown
  invitation?: unknown
  projectMembers?: unknown
  workspaceMembers?: unknown
  invitationPlaces?: unknown
  accessRequests?: unknown
  auditEvents?: unknown
  notifications?: unknown
  releaseVisits?: unknown
  images?: unknown
}

export interface DrizzleAdapterOptions {
  tokenCrypto?: TokenCrypto
  /**
   * Renews a short-lived credential on read (OAuth access tokens). The app
   * supplies it; the db package never calls a provider itself.
   */
  refreshConnection?: ConnectionRefresh
  /**
   * Which SQL the JSON aggregates are spelled in. Read off the drizzle
   * instance when omitted (sqlite covers D1 too); set it only to override.
   */
  dialect?: Dialect
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectDialect(db: any): Dialect {
  return is(db.dialect, PgDialect) ? 'pg' : 'sqlite'
}

export class DrizzleDatabaseAdapter implements DatabaseAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _db: any
  private _schema: SchemaRef
  private _workflows: WorkflowsAdapter
  private _shared: SharedWorkflowsAdapter
  private _audit: AuditAdapter
  private _notifications: NotificationsAdapter
  private _versions: VersionsAdapter
  private _connections: ConnectionsAdapter
  private _projectConnections: ProjectConnectionsAdapter
  private _runs: RunsAdapter
  private _runSteps: RunStepsAdapter
  private _workflowFiles: WorkflowFilesAdapter
  private _testSessions: TestSessionsAdapter
  private _deployments: DeploymentsAdapter
  private _apiKeys: ApiKeysAdapter
  private _envVars: EnvVarsAdapter
  private _projects: ProjectsAdapter
  private _installedNodes: InstalledNodesAdapter
  private _deploymentConfigs: DeploymentConfigsAdapter
  private _account?: AccountAdapter
  private _images: ImagesAdapter
  private _scope: ScopeAdapter
  private _summaries: SummaryAdapter
  private _access: AccessAdapter
  private _invitations: InvitationsAdapter
  private _accessRequests: AccessRequestsAdapter
  private _workspaces: WorkspacesAdapter
  private _workspaceRuns: WorkspaceRunsAdapter
  private _dialect: Dialect
  private _crypto?: TokenCrypto
  private _tables: OverviewTables

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, schema: SchemaRef, options?: DrizzleAdapterOptions) {
    this._db = db
    this._schema = schema
    this._crypto = options?.tokenCrypto
    this._dialect = options?.dialect ?? detectDialect(db)
    // The dashboard's reads join the auth tables; a schema without them (a
    // test with app tables only) fails on first use rather than at construction.
    const tables: OverviewTables = {
      organization: schema.organization,
      member: schema.member,
      user: schema.user,
      session: schema.session,
      projects: schema.projects,
      workspaces: schema.workspaces,
      projectMembers: schema.projectMembers,
      workspaceMembers: schema.workspaceMembers,
      workflows: schema.workflows,
      workflowRuns: schema.workflowRuns,
      deployments: schema.deployments,
      workflowVersions: schema.workflowVersions,
    }
    this._tables = tables
    // The role SQL for the adapters that only filter by it (keys, variables).
    const roles =
      schema.projectMembers && schema.workspaceMembers ? new RoleFields(tables) : undefined
    this._scope = new ScopeAdapter(db, tables, this._dialect)
    this._summaries = new SummaryAdapter(
      db,
      {
        ...tables,
        apiKeys: schema.apiKeys,
        apiKeyProjects: schema.apiKeyProjects,
        apiKeyWorkspaces: schema.apiKeyWorkspaces,
        envVars: schema.envVars,
        envVarProjects: schema.envVarProjects,
        envVarWorkspaces: schema.envVarWorkspaces,
        installedNodes: schema.installedNodes,
        connections: schema.connections,
      },
      this._dialect,
    )
    this._access = new AccessAdapter(
      db,
      {
        ...tables,
        invitation: schema.invitation,
        invitationPlaces: schema.invitationPlaces,
        envVars: schema.envVars,
        envVarProjects: schema.envVarProjects,
        connections: schema.connections,
        connectionProjects: schema.connectionProjects,
        projectConnections: schema.projectConnections,
        workspaceConnections: schema.workspaceConnections,
      },
      this._dialect,
    )
    this._invitations = new InvitationsAdapter(
      db,
      { ...tables, invitation: schema.invitation, invitationPlaces: schema.invitationPlaces },
      this._dialect,
    )
    this._accessRequests = new AccessRequestsAdapter(
      db,
      { ...tables, accessRequests: schema.accessRequests },
      this._dialect,
    )
    this._workspaces = new WorkspacesAdapter(db, tables, this._dialect)
    this._workspaceRuns = new WorkspaceRunsAdapter(db, tables, this._dialect)
    this._workflows = new WorkflowsAdapter(db, schema.workflows, schema.workspaces)
    this._shared = new SharedWorkflowsAdapter(db, tables, this._dialect)
    this._audit = new AuditAdapter(
      db,
      {
        auditEvents: schema.auditEvents,
        organization: schema.organization,
        member: schema.member,
        user: schema.user,
        projects: schema.projects,
        workspaces: schema.workspaces,
      },
      this._dialect,
    )
    this._notifications = new NotificationsAdapter(
      db,
      {
        ...tables,
        notifications: schema.notifications,
        releaseVisits: schema.releaseVisits,
        accessRequests: schema.accessRequests,
        apiKeys: schema.apiKeys,
        apiKeyProjects: schema.apiKeyProjects,
        apiKeyWorkspaces: schema.apiKeyWorkspaces,
        invitation: schema.invitation,
        connections: schema.connections,
      },
      this._dialect,
    )
    this._versions = new VersionsAdapter(
      db,
      schema.workflowVersions,
      schema.user,
      schema.workflows,
      schema.deployments,
    )
    this._connections = new ConnectionsAdapter(
      db,
      {
        connections: schema.connections,
        connectionProjects: schema.connectionProjects,
        projectConnections: schema.projectConnections,
        projects: schema.projects,
        deployments: schema.deployments,
        deploymentConfigs: schema.deploymentConfigs,
        member: schema.member,
        user: schema.user,
        notifications: schema.notifications,
        envVars: schema.envVars,
        envVarProjects: schema.envVarProjects,
        apiKeys: schema.apiKeys,
        apiKeyProjects: schema.apiKeyProjects,
      },
      this._dialect,
      options?.tokenCrypto,
      roles,
      options?.refreshConnection,
    )
    this._projectConnections = new ProjectConnectionsAdapter(
      db,
      {
        connections: schema.connections,
        connectionProjects: schema.connectionProjects,
        projectConnections: schema.projectConnections,
        workspaceConnections: schema.workspaceConnections,
        projects: schema.projects,
        workspaces: schema.workspaces,
        workflows: schema.workflows,
        deployments: schema.deployments,
        workflowVersions: schema.workflowVersions,
        user: schema.user,
      },
      this._dialect,
      options?.tokenCrypto,
      roles,
    )
    this._runs = new RunsAdapter(db, schema.workflowRuns, schema.workflows, schema.deployments, {
      projects: schema.projects,
      workspaces: schema.workspaces,
      organization: schema.organization,
    })
    this._runSteps = new RunStepsAdapter(
      db,
      schema.workflowRunSteps,
      schema.workflowRuns,
      schema.deployments,
    )
    this._workflowFiles = new WorkflowFilesAdapter(db, schema.workflowFiles)
    this._testSessions = new TestSessionsAdapter(db, schema.testSessions, schema.workflows)
    this._deployments = new DeploymentsAdapter(
      db,
      schema.deployments,
      schema.user,
      schema.workflowVersions,
      schema.connections,
      schema.workflows,
      schema.projects,
    )
    this._apiKeys = new ApiKeysAdapter(
      db,
      {
        apiKeys: schema.apiKeys,
        apiKeyProjects: schema.apiKeyProjects,
        apiKeyWorkspaces: schema.apiKeyWorkspaces,
        projects: schema.projects,
        workspaces: schema.workspaces,
        user: schema.user,
        member: schema.member,
        projectMembers: schema.projectMembers,
        workspaceMembers: schema.workspaceMembers,
      },
      this._dialect,
      roles,
    )
    this._envVars = new EnvVarsAdapter(
      db,
      {
        envVars: schema.envVars,
        projects: schema.projects,
        workspaces: schema.workspaces,
        envVarWorkspaces: schema.envVarWorkspaces,
        envVarProjects: schema.envVarProjects,
        organization: schema.organization,
      },
      this._dialect,
      options?.tokenCrypto,
      roles,
    )
    this._projects = new ProjectsAdapter(db, tables, this._dialect)
    this._installedNodes = new InstalledNodesAdapter(
      db,
      schema.installedNodes,
      {
        workflows: schema.workflows,
        workflowVersions: schema.workflowVersions,
        projects: schema.projects,
      },
      this._dialect,
    )
    this._deploymentConfigs = new DeploymentConfigsAdapter(db, schema.deploymentConfigs)
    this._images = new ImagesAdapter(
      db,
      {
        images: schema.images,
        user: schema.user,
        organization: schema.organization,
      },
      this._dialect,
    )
    if (roles) {
      this._account = new AccountAdapter(
        db,
        { ...tables, account: schema.account },
        this._dialect,
        roles,
      )
    }
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

  getOrganizationIfMember(
    userId: string,
    ref: { id: string } | { slug: string },
  ): Promise<({ id: string; slug: string; name: string } & MemberRole) | null> {
    return this._scope.getOrganizationIfMember(userId, ref)
  }
  getProjectIfMember(
    userId: string,
    ref: ProjectRef,
    workspace?: WorkspaceInProjectRef,
  ): Promise<ProjectAccess | null> {
    return this._scope.getProjectIfMember(userId, ref, workspace)
  }
  getWorkspaceIfMember(userId: string, ref: WorkspaceRef): Promise<WorkspaceAccess | null> {
    return this._scope.getWorkspaceIfMember(userId, ref)
  }
  getWorkflowForUser(userId: string, workflowId: string): Promise<WorkflowAccess | null> {
    return this._scope.getWorkflowForUser(userId, workflowId)
  }
  getWorkspaceInProject(
    projectId: string,
    ref: WorkspaceInProjectRef,
  ): Promise<WorkspaceIds | null> {
    return this._scope.getWorkspaceInProject(projectId, ref)
  }
  listOrganizationsForMember(userId: string): Promise<OrgListing[]> {
    return this._scope.listOrganizationsForMember(userId)
  }
  getScopeBySlugs(userId: string, slugs: ScopeSlugs, now?: Date): Promise<ScopeRows | null> {
    return this._scope.getScopeBySlugs(userId, slugs, now)
  }

  // Projects
  createProject(data: {
    id: string
    organizationId: string
    name: string
    slug: string
    description?: string
    defaultWorkspaceId: string
    createdBy?: string | null
  }): Promise<{ project: Project; workspace: Workspace }> {
    return this._projects.create(data)
  }
  getProjectMoveOutcome(
    id: string,
    fromOrganizationId: string,
    toOrganizationId: string,
  ): Promise<ProjectMoveOutcome | null> {
    return this._projects.getMoveOutcome(id, fromOrganizationId, toOrganizationId)
  }
  getProjectById(id: string): Promise<Project | null> {
    return this._projects.getById(id)
  }
  countProjectsInOrganization(organizationId: string): Promise<number> {
    return this._projects.countByOrganization(organizationId)
  }
  listProjectsByOrganization(
    organizationId: string,
    userId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ProjectOverview>> {
    return this._projects.listByOrganization(organizationId, userId, pagination)
  }
  moveProjectToOrganization(
    projectId: string,
    fromOrganizationId: string,
    toOrganizationId: string,
    moverId: string,
  ): Promise<string> {
    return this._access.moveProject(projectId, fromOrganizationId, toOrganizationId, moverId)
  }
  updateProject(
    id: string,
    organizationId: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<Project | null> {
    return this._projects.update(id, organizationId, data)
  }
  deleteProject(id: string, organizationId: string): Promise<boolean> {
    return this._projects.delete(id, organizationId)
  }
  getProjectLocks(id: string, organizationId: string): Promise<ProjectLocks | null> {
    return this._projects.getLocks(id, organizationId)
  }
  setProjectLock(
    id: string,
    organizationId: string,
    userId: string,
    locked: boolean,
  ): Promise<LockRow | null> {
    return this._projects.setLock(id, organizationId, userId, locked)
  }

  // Workspaces
  listWorkspacesByProject(projectId: string, userId: string): Promise<WorkspaceOverview[]> {
    return this._workspaces.listByProject(projectId, userId)
  }
  createWorkspace(
    data: CreateWorkspaceData,
    members?: { userId: string; role: WorkspaceGrant }[],
  ): Promise<Workspace | null> {
    return this._workspaces.create(data, members)
  }
  getWorkspaceById(id: string): Promise<Workspace | null> {
    return this._workspaces.getById(id)
  }
  updateWorkspace(id: string, data: UpdateWorkspaceData): Promise<Workspace | null> {
    return this._workspaces.update(id, data)
  }
  deleteWorkspaceUnlessBlocked(id: string): Promise<boolean> {
    return this._workspaces.deleteUnlessBlocked(id)
  }
  getWorkspaceLocks(id: string): Promise<WorkspaceLocks | null> {
    return this._workspaces.getLocks(id)
  }
  setWorkspaceLock(id: string, userId: string, locked: boolean): Promise<LockRow | null> {
    return this._workspaces.setLock(id, userId, locked)
  }
  moveWorkflowsToWorkspace(
    fromWorkspaceId: string,
    toWorkspaceId: string,
    workflowIds: string[],
  ): Promise<{ id: string; name: string }[]> {
    return this._workspaces.moveWorkflows(fromWorkspaceId, toWorkspaceId, workflowIds)
  }
  listWorkspaceRuns(
    workspaceId: string,
    filter: WorkspaceRunFilter,
    now?: Date,
  ): Promise<WorkspaceRunPage> {
    return this._workspaceRuns.listByWorkspace(workspaceId, filter, now)
  }
  listFailingWorkflows(organizationId: string, viewerId: string): Promise<FailingWorkflow[]> {
    return this._workspaceRuns.listFailing(organizationId, viewerId)
  }
  orgHomeSummary(organizationId: string, viewerId: string): Promise<OrgHomeSummary | null> {
    return this._summaries.orgHome(organizationId, viewerId)
  }
  projectSummary(
    organizationId: string,
    projectId: string,
    now: string,
  ): Promise<ProjectSummary | null> {
    return this._summaries.projectSummary(organizationId, projectId, now)
  }
  workspaceSettingsCounts(
    workspaceId: string,
    now: string,
  ): Promise<WorkspaceSettingsCounts | null> {
    return this._summaries.workspaceSettingsCounts(workspaceId, now)
  }
  workflowPageSummary(workflowId: string, now: Date): Promise<WorkflowPageSummary | null> {
    return this._summaries.workflowSummary(workflowId, now)
  }
  workspacePageOverview(workspaceId: string, now: Date): Promise<WorkspacePageOverview | null> {
    return this._summaries.workspaceOverview(workspaceId, now)
  }
  resourceCounts(organizationId: string): Promise<ResourceCounts> {
    return this._summaries.resourceCounts(organizationId)
  }

  // Access: people, grants, the access editor
  listOrgMembers(
    organizationId: string,
    viewerId: string,
    options?: { seeAll?: boolean },
  ): Promise<OrgMemberRow[]> {
    return this._access.listOrgMembers(organizationId, viewerId, options)
  }
  getPersonAccess(organizationId: string, userId: string): Promise<PersonAccessRows | null> {
    return this._access.getPersonAccess(organizationId, userId)
  }
  checkInOrganization(
    organizationId: string,
    refs: { userId?: string; userIds?: string[]; projectIds?: string[]; workspaceIds?: string[] },
  ): Promise<InOrgCheck> {
    return this._access.checkInOrganization(organizationId, refs)
  }
  setOrgRole(organizationId: string, userId: string, role: string): Promise<boolean> {
    return this._access.setOrgRole(organizationId, userId, role)
  }
  saveAccess(
    organizationId: string,
    userId: string,
    grant: AccessGrantData,
    createdBy: string,
    caller: { callerIsOwner: boolean },
  ): Promise<void> {
    return this._access.saveAccess(organizationId, userId, grant, createdBy, caller)
  }
  removeOrgMember(
    organizationId: string,
    userId: string,
    caller: { callerIsOwner: boolean },
  ): Promise<boolean> {
    return this._access.removeMember(organizationId, userId, caller)
  }
  listWorkspacePeople(workspaceId: string): Promise<WorkspacePersonRow[]> {
    return this._access.listWorkspacePeople(workspaceId)
  }
  listProjectMembers(projectId: string, viewerId: string): Promise<ProjectMemberRow[]> {
    return this._access.listProjectMembers(projectId, viewerId)
  }
  getGrantRows(workspaceId: string, userId: string): Promise<GrantRows | null> {
    return this._access.grantRowsOf(workspaceId, userId)
  }
  addWorkspaceMember(data: WorkspaceGrantData): Promise<NamedWorkspaceMember | null> {
    return this._access.addWorkspaceMember(data)
  }
  addProjectMember(data: ProjectGrantData): Promise<NamedProjectMember | null> {
    return this._access.addProjectMember(data)
  }
  addWorkspaceGrants(data: {
    projectId: string
    workspaceIds: string[]
    userId: string
    role: WorkspaceGrant
    createdBy: string
  }): Promise<(NamedWorkspaceMember & { workspaceName: string })[]> {
    return this._access.addWorkspaceGrants(data)
  }
  projectGrantRows(
    projectId: string,
    userId: string,
    workspaceIds?: string[],
  ): Promise<ProjectGrantRows | null> {
    return this._access.projectGrantRows(projectId, userId, workspaceIds)
  }
  setWorkspaceGrant(
    workspaceId: string,
    userId: string,
    role: WorkspaceGrant,
  ): Promise<(NamedWorkspaceMember & { changed: boolean }) | null> {
    return this._access.setWorkspaceGrant(workspaceId, userId, role)
  }
  removeWorkspaceGrant(
    workspaceId: string,
    userId: string,
  ): Promise<{ role: string; personName: string | null } | null> {
    return this._access.removeWorkspaceGrant(workspaceId, userId)
  }
  getOrgRole(organizationId: string, userId: string): Promise<string | null> {
    return this._access.orgRoleOf(organizationId, userId)
  }

  // Invitations
  invitationChecks(
    organizationId: string,
    refs: {
      projectIds: string[]
      workspaceIds: string[]
      emails: string[]
      now: string
      inProject?: string
    },
  ): Promise<InvitationChecks> {
    return this._invitations.checks(organizationId, refs)
  }
  createInvitations(invitations: CreateInvitationData[]): Promise<void> {
    return this._invitations.create(invitations)
  }
  listInvitations(organizationId: string, viewerId: string, now: string): Promise<InvitationRow[]> {
    return this._invitations.listByOrganization(organizationId, viewerId, now)
  }
  getInvitation(id: string): Promise<InvitationView | null> {
    return this._invitations.getView(id)
  }
  acceptInvitation(data: AcceptInvitationData): Promise<void> {
    return this._invitations.accept(data)
  }
  setInvitationStatus(id: string, from: string, to: string): Promise<boolean> {
    return this._invitations.setStatus(id, from, to)
  }
  cancelInvitation(id: string, organizationId: string): Promise<string | null> {
    return this._invitations.cancel(id, organizationId)
  }
  resendInvitation(id: string, expiresAt: string, unlessExpiresAfter: string): Promise<boolean> {
    return this._invitations.resend(id, expiresAt, unlessExpiresAfter)
  }
  askForNewInvitation(id: string, at: string): Promise<boolean> {
    return this._invitations.askAgain(id, at)
  }
  listInvitationsForEmail(email: string, now: string): Promise<PendingInvitationRow[]> {
    return this._invitations.listForEmail(email, now)
  }

  // Access requests
  getOwnAccessRequest(workspaceId: string, userId: string): Promise<AccessRequestRow | null> {
    return this._accessRequests.getOwnPending(workspaceId, userId)
  }
  createAccessRequest(data: {
    id: string
    workspaceId: string
    userId: string
    now: string
  }): Promise<{ request: AccessRequestRow; created: boolean } | null> {
    return this._accessRequests.create(data)
  }
  getAccessRequestForDecision(
    id: string,
    deciderId: string,
  ): Promise<AccessRequestDecision | null> {
    return this._accessRequests.getForDecision(id, deciderId)
  }
  decideAccessRequest(data: {
    id: string
    status: 'approved' | 'declined'
    decidedBy: string
    now: string
    alreadyEditing: boolean
    grant: { workspaceId: string; userId: string } | null
  }): Promise<boolean> {
    return this._accessRequests.decide(data)
  }

  // Workflows
  createWorkflow(data: {
    id: string
    projectId: string
    workspaceId?: string | null
    createdBy: string
    name: string
    description?: string
    kind?: 'workflow' | 'script'
  }): Promise<Workflow | null> {
    return this._workflows.create(data)
  }
  getWorkflowById(id: string): Promise<Workflow | null> {
    return this._workflows.getById(id)
  }
  listWorkflowsByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Workflow>> {
    return this._workflows.listByProject(projectId, pagination)
  }

  async listWorkflowsWithStatus(
    projectId: string,
    pagination?: PaginationParams,
    filter?: WorkflowListFilter,
  ): Promise<PaginatedResult<WorkflowWithStatus>> {
    const limit = clampLimit(pagination?.limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = this._schema.workflows as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = this._schema.deployments as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = this._schema.workflowRuns as any
    const u = aliasedTable(this._tables.user, 'sharer')
    const m = aliasedTable(this._tables.member, 'sharer_member')
    const p = aliasedTable(this._tables.projects, 'sharer_project')

    // Drizzle's sql template does not qualify column references with table names,
    // so correlated subqueries must use sql.raw() for the outer table's columns
    // to avoid ambiguous "id" resolving to the inner table instead of "workflows".
    const wId = sql.raw('"workflows"."id"')
    const terminal = sql.raw(TERMINAL_RUN_STATUSES.map((s) => `'${s}'`).join(', '))

    const conditions = [eq(w.projectId, projectId)]
    if (filter?.workspaceId) conditions.push(eq(w.workspaceId, filter.workspaceId))
    else if (filter?.visibleTo) {
      conditions.push(
        this._roles().workflowVisible(filter.visibleTo, sql.raw('"workflows"."workspace_id"')),
      )
    }
    if (filter?.kind) conditions.push(eq(w.kind, filter.kind))
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(w.createdAt, timestamp), and(eq(w.createdAt, timestamp), lt(w.id, cursorId)))!,
      )
    }

    const rows = await this._db
      .select({
        id: w.id,
        projectId: w.projectId,
        workspaceId: w.workspaceId,
        createdBy: w.createdBy,
        name: w.name,
        description: w.description,
        kind: w.kind,
        currentVersionId: w.currentVersionId,
        envVars: w.envVars,
        triggerCode: w.triggerCode,
        dependencies: w.dependencies,
        deployConfig: w.deployConfig,
        sharedBy: w.sharedBy,
        sharedAt: w.sharedAt,
        // The sharer's name while they are in the workflow's organization.
        sharedByName: fieldOf(
          sql<
            string | null
          >`(SELECT ${u.name} FROM ${aliasedFrom(u)} WHERE ${u.id} = ${sql.raw('"workflows"."shared_by"')} AND EXISTS (SELECT 1 FROM ${aliasedFrom(m)} INNER JOIN ${aliasedFrom(p)} ON ${p.organizationId} = ${m.organizationId} WHERE ${p.id} = ${sql.raw('"workflows"."project_id"')} AND ${m.userId} = ${u.id}))`,
        ).as('shared_by_name'),
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        // The newest live deploy's own number: it outlives a deleted version.
        deployedVersion: sql<
          number | null
        >`(SELECT ${d.versionNumber} FROM ${d} WHERE ${d.workflowId} = ${wId} AND ${d.status} = 'success' AND ${d.connectionId} IS NOT NULL ORDER BY ${d.createdAt} DESC, ${d.id} DESC LIMIT 1)`.as(
          'deployed_version',
        ),
        recentRunStatuses:
          sql`(SELECT ${jsonArrayOfValues(this._dialect, sql.raw('recent.status'))} FROM (SELECT ${r.status} AS status FROM ${r} WHERE ${r.workflowId} = ${wId} AND ${r.status} IN (${terminal}) ORDER BY ${r.createdAt} DESC LIMIT 10) AS recent)`.as(
            'recent_run_statuses',
          ),
        // 'success' while it is live on any account (a successful row on an account
        // that still exists); else its newest deploy's status, or null when it never went out
        // (a success on a deleted account is live nowhere, so it is skipped).
        deployStatus: sql<
          string | null
        >`(CASE WHEN EXISTS (SELECT 1 FROM ${d} WHERE ${d.workflowId} = ${wId} AND ${d.status} = 'success' AND ${d.connectionId} IS NOT NULL) THEN 'success' ELSE (SELECT ${d.status} FROM ${d} WHERE ${d.workflowId} = ${wId} AND NOT (${d.status} = 'success' AND ${d.connectionId} IS NULL) ORDER BY ${d.createdAt} DESC, ${d.id} DESC LIMIT 1) END)`.as(
          'deploy_status',
        ),
        deployVersionId: sql<
          string | null
        >`(SELECT ${d.versionId} FROM ${d} WHERE ${d.workflowId} = ${wId} AND ${d.status} = 'success' AND ${d.connectionId} IS NOT NULL ORDER BY ${d.createdAt} DESC, ${d.id} DESC LIMIT 1)`.as(
          'deploy_version_id',
        ),
        lastRunStatus: sql<
          string | null
        >`(SELECT ${r.status} FROM ${r} WHERE ${r.workflowId} = ${wId} ORDER BY ${r.createdAt} DESC LIMIT 1)`.as(
          'last_run_status',
        ),
        lastRunAt: sql<
          string | null
        >`(SELECT ${r.createdAt} FROM ${r} WHERE ${r.workflowId} = ${wId} ORDER BY ${r.createdAt} DESC LIMIT 1)`
          // A raw subquery skips the column's decoder; pg would return its own text format.
          .mapWith(r.createdAt)
          .as('last_run_at'),
      })
      .from(w)
      .where(and(...conditions))
      .orderBy(desc(w.createdAt), desc(w.id))
      .limit(limit + 1)

    const withStatus: WorkflowWithStatus[] = rows.map((row: WorkflowWithStatus) => ({
      ...row,
      recentRunStatuses: readJsonArray<string>(row.recentRunStatuses),
    }))
    return paginateResults(withStatus, limit, (row) => row.createdAt)
  }
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
  ): Promise<Workflow> {
    return this._workflows.update(id, data)
  }
  deleteWorkflow(id: string): Promise<void> {
    return this._workflows.delete(id)
  }
  moveWorkflowToProject(id: string, targetProjectId: string): Promise<Workflow | null> {
    return this._workflows.moveToProject(id, targetProjectId)
  }
  setWorkflowShared(
    id: string,
    workspaceId: string,
    userId: string,
    shared: boolean,
  ): Promise<SharingRow | null> {
    return this._shared.setShared(id, workspaceId, userId, shared)
  }
  listSharedWorkflows(
    filter: SharedWorkflowFilter,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<SharedWorkflowRow>> {
    return this._shared.list(filter, pagination)
  }

  // Audit log
  insertAuditEvents(rows: AuditEventInsert[]): Promise<void> {
    return this._audit.insert(rows)
  }
  private get account(): AccountAdapter {
    if (!this._account) throw new Error('The account reads need the access tables')
    return this._account
  }

  getAccount(userId: string): Promise<AccountRow | null> {
    return this.account.getAccount(userId)
  }

  soleOwnedOrgNames(userId: string): Promise<string[]> {
    return this.account.soleOwnedOrgNames(userId)
  }

  listAccountSessions(
    userId: string,
    currentSessionId: string,
    now = new Date(),
  ): Promise<AccountSessionRow[]> {
    return this.account.listSessions(userId, currentSessionId, now)
  }

  revokeAccountSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<boolean> {
    return this.account.revokeSession(userId, sessionId, currentSessionId)
  }

  revokeOtherAccountSessions(userId: string, currentSessionId: string): Promise<number> {
    return this.account.revokeOtherSessions(userId, currentSessionId)
  }

  exportAccount(
    userId: string,
    currentSessionId: string,
    now = new Date(),
  ): Promise<AccountExportRow | null> {
    return this.account.exportAccount(userId, currentSessionId, now)
  }

  insertPersonAuditEvents(entry: PersonAuditInsert): Promise<void> {
    return this._audit.insertForPerson(entry)
  }
  listAuditEvents(filter: AuditListFilter, pagination?: PaginationParams): Promise<AuditEventPage> {
    return this._audit.list(filter, pagination)
  }
  reserveAuditAttempt(
    attempt: AuditEventInsert,
    since: string,
    ofType?: AuditEventInsert['actorType'],
  ): Promise<FailureCount> {
    return this._audit.reserveAttempt(attempt, since, ofType)
  }
  deleteAuditEvent(id: string): Promise<void> {
    return this._audit.deleteOne(id)
  }
  purgeAuditEvents(before: string): Promise<number> {
    return this._audit.purge(before)
  }

  // Inbox
  notify(entry: NotificationInsert): Promise<NotifiedRecipient[]> {
    return this._notifications.notify(entry)
  }
  clearNotificationsByPrefix(organizationId: string, prefixes: string[]): Promise<void> {
    return this._notifications.clearByPrefix(organizationId, prefixes)
  }
  clearNotifications(organizationId: string, groupKey: string): Promise<void> {
    return this._notifications.clear(organizationId, groupKey)
  }
  notifyExpiringKeys(check: ExpiringKeysCheck): Promise<number> {
    return this._notifications.notifyExpiringKeys(check)
  }
  listNotifications(
    organizationId: string,
    userId: string,
    limit: number,
  ): Promise<NotificationList> {
    return this._notifications.list(organizationId, userId, limit)
  }
  countUnreadNotifications(organizationId: string, userId: string): Promise<number> {
    return this._notifications.countUnread(organizationId, userId)
  }
  markNotificationRead(
    organizationId: string,
    userId: string,
    id: string,
    now: string,
  ): Promise<boolean> {
    return this._notifications.markRead(organizationId, userId, id, now)
  }
  markAllNotificationsRead(organizationId: string, userId: string, now: string): Promise<number> {
    return this._notifications.markAllRead(organizationId, userId, now)
  }
  purgeNotifications(before: string): Promise<number> {
    return this._notifications.purge(before)
  }
  getReleaseVisit(userId: string): Promise<ReleaseVisitRow | null> {
    return this._notifications.getReleaseVisit(userId)
  }
  setReleaseVisit(userId: string, at: string, seenIds: string[]): Promise<ReleaseVisitRow> {
    return this._notifications.setReleaseVisit(userId, at, seenIds)
  }

  // Versions
  createVersion(data: CreateVersionData): Promise<WorkflowVersion> {
    return this._versions.create(data)
  }
  getWorkflowVersionById(id: string): Promise<WorkflowVersion | null> {
    return this._versions.getById(id)
  }
  getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
    return this._versions.getLatest(workflowId)
  }
  updateLatestVersionIfIrMatches(
    latest: Pick<WorkflowVersion, 'id' | 'workflowId' | 'version'>,
    expectedIr: string,
    patch: UpdateVersionData,
  ): Promise<WorkflowVersion | null> {
    return this._versions.updateIfIrMatches(latest, expectedIr, patch)
  }
  advanceCurrentVersion(
    workflowId: string,
    version: Pick<WorkflowVersion, 'id' | 'version'>,
  ): Promise<boolean> {
    return this._versions.advanceCurrent(workflowId, version)
  }
  async getNextVersionNumber(workflowId: string): Promise<number> {
    const max = await this._versions.getMaxVersionNumber(workflowId)
    return max + 1
  }
  listVersionsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowVersionListItem>> {
    return this._versions.listByWorkflow(workflowId, pagination)
  }
  updateVersion(id: string, data: UpdateVersionData): Promise<void> {
    return this._versions.update(id, data)
  }
  getLatestVersionForSave(workflowId: string): Promise<LatestVersionForSave | null> {
    return this._versions.latestForSave(workflowId)
  }
  getVersionDeleteCheck(versionId: string, workflowId: string): Promise<VersionDeleteCheck | null> {
    return this._versions.deleteCheck(versionId, workflowId)
  }
  deleteVersion(id: string): Promise<void> {
    return this._versions.delete(id)
  }

  // Connections
  createConnection(
    data: ConnectionWrite & { id: string; createdBy: string },
  ): Promise<ConnectionListRow | null> {
    return this._connections.create(data)
  }
  getProviderConnectionById(id: string, organizationId?: string): Promise<Connection | null> {
    return this._connections.getById(id, organizationId)
  }
  getConnectionForProject(
    id: string,
    organizationId: string,
    projectId: string,
  ): Promise<ConnectionCoverage | null> {
    return this._connections.getForProject(id, organizationId, projectId)
  }
  getConnectionDeployedWith(
    id: string,
    organizationId: string,
    workflowId: string,
  ): Promise<DeployedConnection | null> {
    return this._connections.getDeployedWith(id, organizationId, workflowId)
  }
  getDeployConfigFor(
    id: string,
    organizationId: string,
    projectId: string,
    workflowId: string,
  ): Promise<DeployConfigLookup | null> {
    return this._connections.getDeployConfigFor(id, organizationId, projectId, workflowId)
  }
  listConnectionsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Connection>> {
    return this._connections.list(organizationId, { ...pagination, visibleTo: 'all' })
  }
  listConnections(
    organizationId: string,
    options?: ConnectionListOptions,
  ): Promise<PaginatedResult<ConnectionListRow>> {
    return this._connections.list(organizationId, options)
  }
  updateConnection(id: string, data: ConnectionUpdate): Promise<ConnectionListRow | null> {
    return this._connections.update(id, data)
  }
  connectionsDueForTokenCheck(
    provider: string,
    before: string,
    limit: number,
  ): Promise<Connection[]> {
    return this._connections.dueForCheck(provider, before, limit)
  }
  recordConnectionTokenCheck(
    id: string,
    readCheckedAt: string | null,
    check: ConnectionTokenCheck,
  ): Promise<{ organizationId: string } | null> {
    return this._connections.recordTokenCheck(id, readCheckedAt, check)
  }
  notifyExpiringConnections(check: ExpiringConnectionsCheck): Promise<number> {
    return this._connections.notifyExpiring(check)
  }
  getProjectSetup(
    organizationId: string,
    projectId: string,
    now: string,
  ): Promise<ProjectSetupCounts | null> {
    return this._connections.projectSetup(organizationId, projectId, now)
  }
  deleteConnection(id: string): Promise<boolean> {
    return this._connections.delete(id)
  }
  getProjectOwnedConnection(id: string, projectId: string): Promise<Connection | null> {
    return this._connections.getOwnedByProject(id, projectId)
  }

  // A project's accounts
  listProjectConnections(
    projectId: string,
    organizationId: string,
    viewer?: string,
  ): Promise<ProjectConnectionsRows | null> {
    return this._projectConnections.list(projectId, organizationId, viewer)
  }
  listAvailableProjectConnections(
    projectId: string,
    organizationId: string,
    viewer?: string,
  ): Promise<AvailableConnectionRow[]> {
    return this._projectConnections.available(projectId, organizationId, viewer)
  }
  addProjectConnections(input: {
    projectId: string
    organizationId: string
    connectionIds: string[]
    createdBy: string
  }): Promise<{
    added: { id: string; name: string }[]
    alreadyAdded: string[]
    defaultId: string | null
  }> {
    return this._projectConnections.add(input)
  }
  createProjectConnection(
    input: ProjectConnectionCreate,
  ): Promise<{ id: string; name: string; isDefault: boolean } | null> {
    return this._projectConnections.create(input)
  }
  setProjectDefaultConnection(projectId: string, connectionId: string): Promise<string | null> {
    return this._projectConnections.setDefault(projectId, connectionId)
  }
  setWorkspaceConnection(input: {
    projectId: string
    workspaceId: string
    connectionId: string | null
    setBy: string
  }): Promise<WorkspaceConnectionChange> {
    return this._projectConnections.setWorkspaceConnection(input)
  }
  removeProjectConnection(
    projectId: string,
    connectionId: string,
  ): Promise<ProjectConnectionRemoval | null> {
    return this._projectConnections.remove(projectId, connectionId)
  }
  listLiveDeployments(workflowId: string): Promise<LiveDeploymentRow[]> {
    return this._projectConnections.liveDeployments(workflowId)
  }
  listDeployTargets(projectId: string, workspaceId: string | null): Promise<DeployTargetRow[]> {
    return this._projectConnections.deployTargets(projectId, workspaceId)
  }

  // Runs
  createRun(data: {
    id: string
    workflowId: string
    versionId: string | null
    versionNumber: number | null
    connectionId: string
    instanceId: string
    status: string
  }): Promise<WorkflowRun> {
    return this._runs.create(data)
  }
  getWorkflowRunById(id: string): Promise<WorkflowRun | null> {
    return this._runs.getById(id)
  }
  listRunsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowRun>> {
    return this._runs.listByWorkflow(workflowId, pagination)
  }
  updateRun(
    id: string,
    data: { status?: string; output?: string; error?: string },
  ): Promise<WorkflowRun> {
    return this._runs.update(id, data)
  }
  updateRunFromStatus(
    id: string,
    fromStatus: string,
    data: { status: string; output?: string; error?: string; updatedAt?: string },
  ): Promise<boolean> {
    return this._runs.updateFromStatus(id, fromStatus, data)
  }
  listActiveRunsForSync(limit?: number): Promise<ActiveRunForSync[]> {
    return this._runs.listActiveForSync(limit)
  }
  getRunForSync(runId: string, workflowId: string): Promise<ActiveRunForSync | null> {
    return this._runs.getForSync(runId, workflowId)
  }
  upsertRunSteps(runId: string, steps: UpsertRunStepData[]): Promise<void> {
    return this._runSteps.upsertMany(runId, steps)
  }
  listRunSteps(runId: string, workflowId: string): Promise<RunStepsResult> {
    return this._runSteps.listByRun(runId, workflowId)
  }

  listWorkflowFiles(workflowId: string): Promise<WorkflowFile[]> {
    return this._workflowFiles.listByWorkflow(workflowId)
  }
  listWorkflowFileSummaries(workflowId: string): Promise<WorkflowFileSummary[]> {
    return this._workflowFiles.listSummariesByWorkflow(workflowId)
  }
  getWorkflowFile(workflowId: string, path: string): Promise<WorkflowFile | null> {
    return this._workflowFiles.getByPath(workflowId, path)
  }
  upsertWorkflowFile(data: UpsertWorkflowFileData): Promise<WorkflowFile> {
    return this._workflowFiles.upsert(data)
  }
  upsertWorkflowFiles(rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    return this._workflowFiles.upsertMany(rows)
  }
  createWorkflowFile(data: UpsertWorkflowFileData): Promise<WorkflowFile | null> {
    return this._workflowFiles.createIfAbsent(data)
  }
  createWorkflowFilesIfAbsent(rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    return this._workflowFiles.createManyIfAbsent(rows)
  }
  updateWorkflowFileIfMatches(
    data: UpsertWorkflowFileData,
    expectedHash: string,
  ): Promise<WorkflowFile | null> {
    return this._workflowFiles.updateIfMatches(data, expectedHash)
  }
  replaceWorkflowFiles(
    workflowId: string,
    rows: UpsertWorkflowFileData[],
  ): Promise<WorkflowFile[]> {
    return this._workflowFiles.replaceAll(workflowId, rows)
  }
  deleteWorkflowFile(workflowId: string, path: string, expectedHash?: string): Promise<boolean> {
    return this._workflowFiles.deleteByPath(workflowId, path, expectedHash)
  }

  // Test sessions
  reserveTestSession(
    data: ReserveTestSessionData,
    limits: ReserveTestSessionLimits,
  ): Promise<TestSession | null> {
    return this._testSessions.reserve(data, limits)
  }
  activateTestSession(
    id: string,
    userId: string,
    processId: string,
    port: number,
    cutoffs: TestSessionCutoffs,
  ): Promise<TestSession | null> {
    return this._testSessions.activate(id, userId, processId, port, cutoffs)
  }
  getOwnedTestSession(
    id: string,
    userId: string,
    projectId: string,
    cutoffs: TestSessionCutoffs,
    workspaceId?: string,
  ): Promise<OwnedTestSession | null> {
    return this._testSessions.getOwned(id, userId, projectId, cutoffs, workspaceId)
  }
  getLiveTestSessionForWorkflow(
    workflowId: string,
    userId: string,
    cutoffs: TestSessionCutoffs,
  ): Promise<TestSession | null> {
    return this._testSessions.getLiveForWorkflow(workflowId, userId, cutoffs)
  }
  getTestSessionUsage(
    projectId: string,
    userId: string,
    quotaWindowStart: string,
  ): Promise<TestSessionUsage> {
    return this._testSessions.usage(projectId, userId, quotaWindowStart)
  }
  touchTestSession(id: string, userId: string, cutoffs: TestSessionCutoffs): Promise<boolean> {
    return this._testSessions.touch(id, userId, cutoffs)
  }
  markTestSessionStopped(
    id: string,
    status: Extract<TestSessionStatus, 'stopped' | 'failed'>,
    options?: { userId?: string; error?: string },
  ): Promise<boolean> {
    return this._testSessions.markStopped(id, status, options)
  }
  listExpiredTestSessions(
    cutoffs: TestSessionCutoffs,
    limit: number,
    userId?: string,
  ): Promise<ExpiringTestSession[]> {
    return this._testSessions.listExpired(cutoffs, limit, userId)
  }
  listUnfinishedTestSessionsForWorkflow(workflowId: string): Promise<TestSession[]> {
    return this._testSessions.listUnfinishedForWorkflow(workflowId)
  }
  markTestSessionRuntimeAbandoned(
    runtime: TestSession['runtime'],
    error: string,
  ): Promise<TestSession[]> {
    return this._testSessions.markRuntimeAbandoned(runtime, error)
  }

  /** The role table over this adapter's tables, for listings keyed on workflows. */
  private _roles(): RoleFields {
    return new RoleFields(this._tables)
  }

  async listRecentRunsByProject(
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
  ): Promise<PaginatedResult<WorkflowRun>> {
    const limit = clampLimit(pagination?.limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = this._schema.workflows as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = this._schema.workflowRuns as any

    const conditions = [eq(w.projectId, projectId)]
    if (visibleTo) {
      conditions.push(
        this._roles().workflowVisible(visibleTo, sql.raw('"workflows"."workspace_id"')),
      )
    }
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(r.createdAt, timestamp), and(eq(r.createdAt, timestamp), lt(r.id, cursorId)))!,
      )
    }

    const rows = await this._db
      .select({
        id: r.id,
        workflowId: r.workflowId,
        versionId: r.versionId,
        versionNumber: r.versionNumber,
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
      .where(and(...conditions))
      .orderBy(desc(r.createdAt), desc(r.id))
      .limit(limit + 1)

    return paginateResults(rows, limit, (row) => row.createdAt)
  }

  // Deployments
  createDeployment(data: {
    id: string
    workflowId: string
    versionId: string
    versionNumber: number
    connectionId: string
    serviceName: string
    serviceUrl?: string
    status: string
    error?: string
    configSnapshot?: string
    createdBy?: string
  }): Promise<Deployment> {
    return this._deployments.create(data)
  }
  async isLiveVersionLocked(workflowId: string, connectionId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = this._schema.deployments as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = this._schema.workflowVersions as any
    // The account's live row first, then its version: a deleted version is unlocked.
    const rows = await this._db
      .select({ locked: v.locked })
      .from(d)
      .leftJoin(v, eq(d.versionId, v.id))
      .where(
        and(
          eq(d.workflowId, workflowId),
          eq(d.connectionId, connectionId),
          eq(d.status, 'success'),
        ),
      )
      .orderBy(desc(d.createdAt), desc(d.id))
      .limit(1)
    return rows[0]?.locked === 1
  }
  listDeploymentsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<DeploymentListItem>> {
    return this._deployments.listByWorkflow(workflowId, pagination)
  }

  async listRecentDeploymentsByProject(
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
    workspaceId?: string,
  ): Promise<PaginatedResult<Deployment>> {
    const limit = clampLimit(pagination?.limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = this._schema.workflows as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = this._schema.deployments as any

    const conditions = [eq(w.projectId, projectId)]
    if (workspaceId) conditions.push(eq(w.workspaceId, workspaceId))
    if (visibleTo) {
      conditions.push(
        this._roles().workflowVisible(visibleTo, sql.raw('"workflows"."workspace_id"')),
      )
    }
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(d.createdAt, timestamp), and(eq(d.createdAt, timestamp), lt(d.id, cursorId)))!,
      )
    }

    const rows = await this._db
      .select({
        id: d.id,
        workflowId: d.workflowId,
        versionId: d.versionId,
        connectionId: d.connectionId,
        serviceName: d.serviceName,
        serviceUrl: d.serviceUrl,
        status: d.status,
        error: d.error,
        configSnapshot: d.configSnapshot,
        createdAt: d.createdAt,
      })
      .from(d)
      .innerJoin(w, eq(d.workflowId, w.id))
      .where(and(...conditions))
      .orderBy(desc(d.createdAt), desc(d.id))
      .limit(limit + 1)

    return paginateResults(rows, limit, (row) => row.createdAt)
  }

  takeDownDeploymentsOnConnection(
    workflowId: string,
    connectionId: string,
    before: string,
    takenDownBy: string | null,
  ): Promise<void> {
    return this._deployments.takeDownOnConnection(workflowId, connectionId, before, takenDownBy)
  }

  // Deployment Configs
  getDeploymentConfig(workflowId: string, connectionId: string): Promise<DeploymentConfig | null> {
    return this._deploymentConfigs.get(workflowId, connectionId)
  }
  upsertDeploymentConfig(data: {
    id: string
    workflowId: string
    connectionId: string
    provider: string
    config: string
    updatedBy?: string
  }): Promise<DeploymentConfig> {
    return this._deploymentConfigs.upsert(data)
  }
  listDeploymentConfigsByWorkflow(workflowId: string): Promise<DeploymentConfig[]> {
    return this._deploymentConfigs.listByWorkflow(workflowId)
  }
  deleteDeploymentConfig(workflowId: string, connectionId: string): Promise<void> {
    return this._deploymentConfigs.delete(workflowId, connectionId)
  }

  // API Keys
  createApiKey(data: CreateApiKeyData): Promise<ApiKey | null> {
    return this._apiKeys.create(data)
  }
  getApiKeyById(id: string): Promise<ApiKey | null> {
    return this._apiKeys.getById(id)
  }
  getApiKeyAuthByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    return this._apiKeys.getAuthByHash(keyHash)
  }
  listApiKeysByProject(
    organizationId: string,
    projectId: string,
    visibleTo?: string,
    fullReach = false,
    now?: string,
  ): Promise<ApiKeyScopedRows> {
    return this._apiKeys.listByProject(organizationId, projectId, visibleTo, fullReach, now)
  }
  listApiKeysByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    return this._apiKeys.listByOrganization(organizationId, pagination)
  }
  countApiKeysByWorkspace(projectId: string, viewerId: string): Promise<WorkspaceKeyCount[]> {
    return this._apiKeys.countByWorkspace(projectId, viewerId)
  }
  listApiKeysByWorkspace(
    workspaceId: string,
    now: string,
    fullReach = false,
  ): Promise<ApiKeyScopedRows> {
    return this._apiKeys.listByWorkspace(workspaceId, now, fullReach)
  }
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void> {
    return this._apiKeys.updateLastUsed(id, lastUsedAt)
  }
  revokeApiKey(id: string, target: ApiKeyTarget): Promise<ApiKey | null> {
    return this._apiKeys.revoke(id, target)
  }
  /** Per-consumer revoke: one project or workspace drops its own slice of a shared key. */
  revokeApiKeyScope(target: ApiKeyScopeTarget): Promise<ApiKey | null> {
    return this._apiKeys.revokeScope(target)
  }

  // Env Vars
  createEnvVar(data: {
    id: string
    place: VariablePlace
    createdBy: string
    name: string
    value: string
    isSecret: boolean
  }): Promise<EnvVar | null> {
    return this._envVars.create(data)
  }
  listEnvVarsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
    options?: { seeAll?: boolean },
  ): Promise<PaginatedResult<OrgEnvVar>> {
    return this._envVars.listByOrganization(organizationId, pagination, visibleTo, options)
  }
  listEnvVarsByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    return this._envVars.listByProject(organizationId, projectId, pagination)
  }
  listEnvVarsByWorkspace(
    organizationId: string,
    projectId: string,
    workspaceId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    return this._envVars.listByWorkspace(organizationId, projectId, workspaceId, pagination)
  }
  listResolvedVariablesForProject(
    organizationId: string,
    projectId: string,
    visibleTo?: string,
  ): Promise<ResolvedProjectVariable[]> {
    return this._envVars.listResolvedForProject(organizationId, projectId, visibleTo)
  }
  listResolvedVariablesForWorkspace(
    organizationId: string,
    projectId: string,
    workspaceId: string,
  ): Promise<ResolvedWorkspaceVariable[]> {
    return this._envVars.listResolvedForWorkspace(organizationId, projectId, workspaceId)
  }
  updateEnvVar(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean; allPlaces?: true },
  ): Promise<EnvVar | null> {
    return this._envVars.update(id, place, data)
  }
  createEnvVarWithReach(
    data: Parameters<EnvVarsAdapter['createWithReach']>[0],
    placeIds: string[],
  ) {
    return this._envVars.createWithReach(data, placeIds)
  }
  updateEnvVarWithReach(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean },
    placeIds: string[],
  ) {
    return this._envVars.updateWithReach(id, place, data, placeIds)
  }
  deleteEnvVar(id: string, place: VariablePlace): Promise<string | null> {
    return this._envVars.delete(id, place)
  }
  isSecretVariableAt(id: string, place: VariablePlace): Promise<boolean> {
    return this._envVars.isSecretAt(id, place)
  }

  async getWorkflowEnvVars(workflowId: string): Promise<WorkflowEnvVar[]> {
    const workflow = await this._workflows.getById(workflowId)
    return workflow ? this.decodeWorkflowEnvVars(workflow) : []
  }

  async decodeWorkflowEnvVars(workflow: Workflow): Promise<WorkflowEnvVar[]> {
    if (!workflow.envVars) return []
    try {
      const vars = JSON.parse(workflow.envVars) as WorkflowEnvVar[]
      if (!this._crypto) return vars
      return Promise.all(
        vars.map(async (v) => {
          if (!v.isSecret) return v
          try {
            return { ...v, value: await this._crypto!.decrypt(v.value) }
          } catch {
            return v
          }
        }),
      )
    } catch {
      return []
    }
  }

  async setWorkflowEnvVars(workflowId: string, vars: WorkflowEnvVar[]): Promise<void> {
    let toStore = vars
    if (this._crypto) {
      toStore = await Promise.all(
        vars.map(async (v) => {
          if (!v.isSecret) return v
          return { ...v, value: await this._crypto!.encrypt(v.value) }
        }),
      )
    }
    await this._workflows.update(workflowId, { envVars: JSON.stringify(toStore) })
  }

  findEnvVarsByNames(
    organizationId: string,
    names: readonly string[],
    projectId?: string | null,
    workspaceId?: string | null,
  ): Promise<EnvVar[]> {
    return this._envVars.findByNames(organizationId, names, projectId, workspaceId)
  }

  // Installed Nodes (Marketplace)
  installNode(data: {
    id: string
    organizationId: string
    nodeId: string
    version: string
    bundle: string
    installedBy: string
  }): Promise<InstalledNode> {
    return this._installedNodes.install(data)
  }
  uninstallNode(organizationId: string, nodeId: string): Promise<void> {
    return this._installedNodes.uninstall(organizationId, nodeId)
  }
  listNodeUsage(organizationId: string): Promise<NodeUsage[]> {
    return this._installedNodes.usage(organizationId)
  }
  listInstalledNodes(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<InstalledNode>> {
    return this._installedNodes.listByOrganization(organizationId, pagination)
  }
  getInstalledNode(organizationId: string, nodeId: string): Promise<InstalledNode | null> {
    return this._installedNodes.getByOrgAndNodeId(organizationId, nodeId)
  }
  updateInstalledNodeBundle(
    organizationId: string,
    nodeId: string,
    data: { version: string; bundle: string },
  ): Promise<InstalledNode> {
    return this._installedNodes.updateBundle(organizationId, nodeId, data)
  }

  // Uploaded images
  insertImage(row: ImageInsert): Promise<void> {
    return this._images.insertImage(row)
  }
  insertImages(rows: ImageInsert[]): Promise<void> {
    return this._images.insertImages(rows)
  }
  setImageData(id: string, data: Uint8Array): Promise<void> {
    return this._images.setImageData(id, data)
  }
  getImageData(id: string): Promise<Uint8Array | null> {
    return this._images.getImageData(id)
  }
  getImage(id: string): Promise<ServableImage | null> {
    return this._images.getImage(id)
  }
  setOwnerImage(owner: ImageOwner, imageId: string): Promise<{ set: boolean; others: string[] }> {
    return this._images.setOwnerImage(owner, imageId)
  }
  clearOwnerImage(owner: ImageOwner): Promise<string[]> {
    return this._images.clearOwnerImage(owner)
  }
  listOwnerImages(owner: ImageOwner): Promise<string[]> {
    return this._images.listOwnerImages(owner)
  }
  listUnreferencedImages(before: string, limit: number): Promise<string[]> {
    return this._images.listUnreferencedImages(before, limit)
  }
  claimImages(ids: string[], at: string): Promise<string[]> {
    return this._images.claimImages(ids, at)
  }
  deleteImages(ids: string[]): Promise<void> {
    return this._images.deleteImages(ids)
  }
  existingImages(ids: string[]): Promise<string[]> {
    return this._images.existingImages(ids)
  }
  listInlineImages(limit: number): Promise<InlineImageRow[]> {
    return this._images.listInlineImages(limit)
  }
  replaceInlineImages(
    moved: { owner: ImageOwner; imageId: string }[],
    cleared: ImageOwner[],
  ): Promise<void> {
    return this._images.replaceInlineImages(moved, cleared)
  }
  clearRemoteImages(): Promise<void> {
    return this._images.clearRemoteImages()
  }
}
