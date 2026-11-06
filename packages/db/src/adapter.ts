import type {
  Workflow,
  WorkflowVersion,
  WorkflowVersionListItem,
  DeploymentListItem,
  Connection,
  ConnectionCoverage,
  ConnectionListOptions,
  ConnectionListRow,
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
  ApiKeyScopedRows,
  ApiKeyScopeTarget,
  ApiKeyTarget,
  CreateApiKeyData,
  WorkspaceKeyCount,
  OrgEnvVar,
  ResolvedProjectVariable,
  ResolvedWorkspaceVariable,
  VariablePlace,
  Workspace,
  WorkspaceOverview,
  WorkspaceIds,
  WorkspaceRef,
  WorkspaceInProjectRef,
  ProjectRef,
  ProjectOverview,
  ProjectLocks,
  WorkspaceLocks,
  LockRow,
  SharingRow,
  SharedWorkflowRow,
  SharedWorkflowFilter,
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
  ImageInsert,
  ImageOwner,
  InlineImageRow,
  ServableImage,
} from './types.js'
import type { PaginationParams, PaginatedResult } from './pagination.js'

export interface WorkflowWithStatus extends Workflow {
  deployStatus: string | null
  deployVersionId: string | null
  /** The version number the latest deployment put live, null for drafts. */
  deployedVersion: number | null
  /** Who shared it to the project, while they are in its organization. */
  sharedByName: string | null
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
  ): Promise<({ id: string; slug: string; name: string } & MemberRole) | null>
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
  listOrganizationsForMember(userId: string): Promise<OrgListing[]>
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
   * and the project is not locked (both checked in the statement): open invitations' places into it and grants
   * held by people outside the target go. Answers the `updated_at` stamp a
   * move writes; `getProjectMoveOutcome` afterwards says whether it moved,
   * and the stamp whether this call is what moved it — and a slug the target already uses
   * surfaces as `isUniqueViolation`.
   */
  /** Where a move left the project, with both organizations' names — one statement. */
  getProjectMoveOutcome(
    id: string,
    fromOrganizationId: string,
    toOrganizationId: string,
  ): Promise<ProjectMoveOutcome | null>
  moveProjectToOrganization(
    projectId: string,
    fromOrganizationId: string,
    toOrganizationId: string,
    moverId: string,
  ): Promise<string>
  /** Updates only within the organization — null when no such row there. */
  updateProject(
    id: string,
    organizationId: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<Project | null>
  /**
   * Deletes only within the organization, and only while neither the project
   * nor any workspace in it is locked (checked in the statement) — false
   * otherwise; `getProjectLocks` says which.
   */
  deleteProject(id: string, organizationId: string): Promise<boolean>
  /** Null when no such project in the organization. */
  getProjectLocks(id: string, organizationId: string): Promise<ProjectLocks | null>
  /**
   * Turns the project's deletion lock on or off. Turning on a lock that is
   * on keeps who set it and when; `changed` says whether it was flipped.
   * Null when no such project in the organization.
   */
  setProjectLock(
    id: string,
    organizationId: string,
    userId: string,
    locked: boolean,
  ): Promise<LockRow | null>

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
  /**
   * False when it is the project's last workspace, it or its project is
   * locked (checked in the statement), or it is gone; `getWorkspaceLocks`
   * says which.
   */
  deleteWorkspaceUnlessBlocked(id: string): Promise<boolean>
  /** Null when no such workspace. */
  getWorkspaceLocks(id: string): Promise<WorkspaceLocks | null>
  /**
   * As `setProjectLock`, for a workspace: null when it is gone or its
   * project is locked (the project's lock decides for every workspace in it).
   */
  setWorkspaceLock(id: string, userId: string, locked: boolean): Promise<LockRow | null>
  /** The workflows that moved, by id and name; a target outside the source's project moves none. */
  moveWorkflowsToWorkspace(
    fromWorkspaceId: string,
    toWorkspaceId: string,
    workflowIds: string[],
  ): Promise<{ id: string; name: string }[]>
  /** `now` places `byHour`'s 24-hour window (tests pin it). */
  listWorkspaceRuns(
    workspaceId: string,
    filter: WorkspaceRunFilter,
    now?: Date,
  ): Promise<WorkspaceRunPage>
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
   * an owner and the caller is not, when nothing changes. Answers whether
   * this call removed them; on false, `getOrgRole` says why.
   */
  removeOrgMember(
    organizationId: string,
    userId: string,
    caller: { callerIsOwner: boolean },
  ): Promise<boolean>
  listWorkspacePeople(workspaceId: string): Promise<WorkspacePersonRow[]>
  listProjectMembers(projectId: string, viewerId: string): Promise<ProjectMemberRow[]>
  /** The rows behind one person's standing in a workspace; null for an unknown workspace. */
  getGrantRows(workspaceId: string, userId: string): Promise<GrantRows | null>
  /** Null when they are outside the org, already in, or the role is at or below what the project gives. */
  addWorkspaceMember(data: WorkspaceGrantData): Promise<NamedWorkspaceMember | null>
  /** A project-wide grant for someone in the org without one; null when refused (see `projectGrantRows`). */
  addProjectMember(data: ProjectGrantData): Promise<NamedProjectMember | null>
  /** One role in several of the project's workspaces; the grants written, with each workspace's name. */
  addWorkspaceGrants(data: {
    projectId: string
    workspaceIds: string[]
    userId: string
    role: WorkspaceGrant
    createdBy: string
  }): Promise<(NamedWorkspaceMember & { workspaceName: string })[]>
  /** Their org role and project grant, to say why a project add was refused. */
  projectGrantRows(
    projectId: string,
    userId: string,
    workspaceIds?: string[],
  ): Promise<ProjectGrantRows | null>
  /**
   * Null when there is no grant, or the role is at or below what the project
   * gives. `changed` is false when it already had that role.
   */
  setWorkspaceGrant(
    workspaceId: string,
    userId: string,
    role: WorkspaceGrant,
  ): Promise<(NamedWorkspaceMember & { changed: boolean }) | null>
  /** The removed grant's role and the person's name (their email when it is blank); null when there was none. */
  removeWorkspaceGrant(
    workspaceId: string,
    userId: string,
  ): Promise<{ role: string; personName: string | null } | null>
  getOrgRole(organizationId: string, userId: string): Promise<string | null>

  // Invitations (storage is better-auth's table; the lifecycle is this API's)
  /** One read of every check inviting needs: which ids are the organization's, which addresses are taken. */
  invitationChecks(
    organizationId: string,
    refs: {
      projectIds: string[]
      workspaceIds: string[]
      emails: string[]
      now: string
      inProject?: string
    },
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
  /** Cancels an open or declined invitation of the organization: its address, or null when there is none to cancel. */
  cancelInvitation(id: string, organizationId: string): Promise<string | null>
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
  /** Answers a pending request (and grants, when approving); whether this call decided it. */
  decideAccessRequest(data: {
    id: string
    status: 'approved' | 'declined'
    decidedBy: string
    now: string
    alreadyEditing: boolean
    grant: { workspaceId: string; userId: string } | null
  }): Promise<boolean>

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
  /**
   * Shares it to its project or stops, while it is still in `workspaceId` (the
   * one the caller was judged on); sharing again keeps the first sharer. Null
   * when it is gone or has moved.
   */
  setWorkflowShared(
    id: string,
    workspaceId: string,
    userId: string,
    shared: boolean,
  ): Promise<SharingRow | null>
  /** A project's shared workflows and functions, newest share first, in one statement. */
  listSharedWorkflows(
    filter: SharedWorkflowFilter,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<SharedWorkflowRow>>

  // Your account (B10): the person's own rows, across every organization
  /** The Profile page: the person, their organizations (role, visible projects, only owner) and linked providers. */
  getAccount(userId: string): Promise<AccountRow | null>
  /** The organizations the person is the only owner of, by name — what blocks deleting the account. */
  soleOwnedOrgNames(userId: string): Promise<string[]>
  /** Unexpired sessions, the current one first. */
  listAccountSessions(
    userId: string,
    currentSessionId: string,
    now?: Date,
  ): Promise<AccountSessionRow[]>
  /** Signs out one of the person's other sessions; false when none matches. */
  revokeAccountSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<boolean>
  /** Signs out every other session of the person; how many went. */
  revokeOtherAccountSessions(userId: string, currentSessionId: string): Promise<number>
  /** Download JSON's rows: profile, linked providers, unexpired sessions and memberships with their grants. */
  exportAccount(
    userId: string,
    currentSessionId: string,
    now?: Date,
  ): Promise<AccountExportRow | null>

  // Audit log (B7)
  insertAuditEvents(rows: AuditEventInsert[]): Promise<void>
  /** An event about the person (a sign-in, B10 account events), one row per organization they are in, in one statement. */
  insertPersonAuditEvents(entry: PersonAuditInsert): Promise<void>
  /** A page of an organization's log, newest first, with the matching total — one statement. */
  listAuditEvents(filter: AuditListFilter, pagination?: PaginationParams): Promise<AuditEventPage>
  /**
   * Writes `attempt` and counts the actor's other attempts since `since` —
   * only `ofType`'s when given — in one statement (the lockout's reservation).
   */
  reserveAuditAttempt(
    attempt: AuditEventInsert,
    since: string,
    ofType?: AuditEventInsert['actorType'],
  ): Promise<FailureCount>
  deleteAuditEvent(id: string): Promise<void>
  /** Deletes rows older than `before`; how many went. */
  purgeAuditEvents(before: string): Promise<number>

  // Inbox (B8)
  /**
   * One row per recipient in one statement — those in the organization who
   * can see the place, minus the actor; a repeat is kept or folded. Answers
   * who was written to, with address and name, `count` 1 for a new row.
   */
  notify(entry: NotificationInsert): Promise<NotifiedRecipient[]>
  /** Deletes a group's rows in the organization (an answered ask, an undone decline). */
  clearNotifications(organizationId: string, groupKey: string): Promise<void>
  /** Deletes the organization's rows whose group key starts with one of `prefixes`. */
  clearNotificationsByPrefix(organizationId: string, prefixes: string[]): Promise<void>
  /** Warns live keys' creators before expiry, once per threshold, in one statement; rows written. */
  notifyExpiringKeys(check: ExpiringKeysCheck): Promise<number>
  /** A person's Inbox in an organization, newest first, with the pills' counts — one statement. */
  listNotifications(
    organizationId: string,
    userId: string,
    limit: number,
  ): Promise<NotificationList>
  /** False when the row isn't the person's in this organization. */
  markNotificationRead(
    organizationId: string,
    userId: string,
    id: string,
    now: string,
  ): Promise<boolean>
  markAllNotificationsRead(organizationId: string, userId: string, now: string): Promise<number>
  /** Deletes rows last touched before `before`; how many went. */
  purgeNotifications(before: string): Promise<number>
  getReleaseVisit(userId: string): Promise<ReleaseVisitRow | null>
  setReleaseVisit(userId: string, at: string, seenIds: string[]): Promise<ReleaseVisitRow>

  // Workflow Versions
  createVersion(data: CreateVersionData): Promise<WorkflowVersion>
  getWorkflowVersionById(id: string): Promise<WorkflowVersion | null>
  getNextVersionNumber(workflowId: string): Promise<number>
  listVersionsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowVersionListItem>>
  updateVersion(id: string, data: UpdateVersionData): Promise<void>
  deleteVersion(id: string): Promise<void>

  // Connections
  /**
   * Writes and answers the row as the list shows it. Null when a project id
   * isn't the organization's: then nothing is written.
   */
  createConnection(
    data: ConnectionWrite & { id: string; createdBy: string },
  ): Promise<ConnectionListRow | null>
  getProviderConnectionById(id: string, organizationId?: string): Promise<Connection | null>
  /** The organization's connection with whether it serves the project, in one read. */
  getConnectionForProject(
    id: string,
    organizationId: string,
    projectId: string,
  ): Promise<ConnectionCoverage | null>
  /** The org's connection, only if the workflow has a successful deployment made with it. */
  getConnectionDeployedWith(
    id: string,
    organizationId: string,
    workflowId: string,
  ): Promise<Connection | null>
  listConnectionsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Connection>>
  /** The dashboard's list: who added each, the projects it serves, its deployments. */
  listConnections(
    organizationId: string,
    options?: ConnectionListOptions,
  ): Promise<PaginatedResult<ConnectionListRow>>
  /**
   * Answers the row as the list shows it; null when nothing was written —
   * the row isn't the organization's, or a project id isn't.
   */
  updateConnection(id: string, data: ConnectionUpdate): Promise<ConnectionListRow | null>
  /** Connections whose token was never checked or last checked before `before`, oldest first. */
  connectionsDueForTokenCheck(
    provider: string,
    before: string,
    limit: number,
  ): Promise<Connection[]>
  /** Stores a check unless the row was re-checked since it was read; null when skipped. */
  recordConnectionTokenCheck(
    id: string,
    readCheckedAt: string | null,
    check: ConnectionTokenCheck,
  ): Promise<{ organizationId: string } | null>
  /** Warns creators and org owners/admins of tokens about to expire; rows written. */
  notifyExpiringConnections(check: ExpiringConnectionsCheck): Promise<number>
  /** A project's setup counts, or null when it isn't the organization's. */
  getProjectSetup(
    organizationId: string,
    projectId: string,
    now: string,
  ): Promise<ProjectSetupCounts | null>
  /** Whether a row went: false when it was already gone. */
  deleteConnection(id: string): Promise<boolean>
  /** The project's own account (never a shared one). */
  getProjectOwnedConnection(id: string, projectId: string): Promise<Connection | null>

  // A project's accounts (23a–23c)
  /** Its accounts and workspace rows; `viewer` sees the workspaces they can open. Null: not the org's. */
  listProjectConnections(
    projectId: string,
    organizationId: string,
    viewer?: string,
  ): Promise<ProjectConnectionsRows | null>
  /** The organization's accounts as the project's Add connection lists them. */
  listAvailableProjectConnections(
    projectId: string,
    organizationId: string,
    viewer?: string,
  ): Promise<AvailableConnectionRow[]>
  /** Adds organization accounts that serve the project; the first becomes its default. */
  addProjectConnections(input: {
    projectId: string
    organizationId: string
    connectionIds: string[]
    createdBy: string
  }): Promise<{
    added: { id: string; name: string }[]
    alreadyAdded: string[]
    defaultId: string | null
  }>
  /** Connects a new account from the project; null when the project isn't the org's. */
  createProjectConnection(
    input: ProjectConnectionCreate,
  ): Promise<{ id: string; name: string; isDefault: boolean } | null>
  /** Makes one of the project's accounts its default; its name, or null when it isn't one. */
  setProjectDefaultConnection(projectId: string, connectionId: string): Promise<string | null>
  /** Points a workspace at one of the project's accounts, or back to the default. */
  setWorkspaceConnection(input: {
    projectId: string
    workspaceId: string
    connectionId: string | null
    setBy: string
  }): Promise<WorkspaceConnectionChange>
  /** Takes an account off the project (an owned one is deleted); null when it wasn't one. */
  removeProjectConnection(
    projectId: string,
    connectionId: string,
  ): Promise<ProjectConnectionRemoval | null>
  /** The accounts a workflow has a successful deployment with, latest first: what a trigger may name. */
  listConnectionsDeployedWith(workflowId: string): Promise<{ id: string; name: string }[]>
  /** The accounts Deploy offers a workflow, the chosen one flagged. */
  listDeployTargets(projectId: string, workspaceId: string | null): Promise<DeployTargetRow[]>

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
  /** Writes `data` only while the run is in `fromStatus`; whether it did — one statement. */
  updateRunFromStatus(
    id: string,
    fromStatus: string,
    data: { status: string; output?: string; error?: string; updatedAt?: string },
  ): Promise<boolean>
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
  /** Session + workflow + expiry, scoped to its owner, project and (when given) workspace in one statement. */
  getOwnedTestSession(
    id: string,
    userId: string,
    projectId: string,
    cutoffs: TestSessionCutoffs,
    workspaceId?: string,
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
    createdBy?: string
  }): Promise<Deployment>
  getActiveDeployment(workflowId: string): Promise<Deployment | null>
  isActiveDeploymentLocked(workflowId: string): Promise<boolean>
  listDeploymentsByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<DeploymentListItem>>
  /** Across the project's workflows `visibleTo` can open, or one workspace's with `workspaceId`. */
  listRecentDeploymentsByProject(
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
    workspaceId?: string,
  ): Promise<PaginatedResult<Deployment>>
  /**
   * A takedown on one account: that account's rows made up to `before` go (a deploy
   * finishing during the takedown keeps its row); the other accounts' rows stay.
   */
  deleteDeploymentsOnConnection(
    workflowId: string,
    connectionId: string,
    before: string,
  ): Promise<void>

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

  // API keys (B3): one level each — organization, project or workspace — with
  // a grid of permissions; every list is one statement at its level.
  /** Null when the creator cannot open every scope in the set (all-or-nothing). */
  createApiKey(data: CreateApiKeyData): Promise<ApiKey | null>
  getApiKeyById(id: string): Promise<ApiKey | null>
  /**
   * The key, whether its creator is still a member of its organization,
   * whether the key that minted it is live, and the key's live scope set —
   * one read. The addressed place is matched against the set at request time.
   */
  getApiKeyAuthByHash(keyHash: string): Promise<ApiKeyAuth | null>
  /**
   * A project's keys page: its own single-project keys and the keys reaching it
   * from elsewhere (expired bundles excluded). `fullReach` (an organization
   * admin) discloses a reaching bundle's whole scope set; otherwise it shows
   * only its slice here.
   */
  listApiKeysByProject(
    organizationId: string,
    projectId: string,
    visibleTo?: string,
    fullReach?: boolean,
    now?: string,
  ): Promise<ApiKeyScopedRows>
  /** The keys that live at the organization: its organization-level keys and its multi-project keys. */
  listApiKeysByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>>
  /** Live keys reaching each workspace of the project, for the workspaces the viewer can open. */
  countApiKeysByWorkspace(projectId: string, viewerId: string): Promise<WorkspaceKeyCount[]>
  /**
   * A workspace's keys page: its own single-workspace keys and the keys reaching
   * it from elsewhere. `fullReach` (an organization admin) discloses a reaching
   * bundle's whole scope set; otherwise it shows only its slice here.
   */
  listApiKeysByWorkspace(
    workspaceId: string,
    now: string,
    fullReach?: boolean,
  ): Promise<ApiKeyScopedRows>
  updateApiKeyLastUsed(id: string, lastUsedAt: string): Promise<void>
  /** The whole-key kill-switch, from the key's home; null when no such live key there. */
  revokeApiKey(id: string, target: ApiKeyTarget): Promise<ApiKey | null>
  /** Per-consumer revoke: one place drops its own slice; the last to go stamps the key dead. Null when no live slice. */
  revokeApiKeyScope(target: ApiKeyScopeTarget): Promise<ApiKey | null>

  // Environment Variables (B4): one row per level, pinned to its place
  /**
   * Writes a variable at `place`: org-wide as is; a project's or a
   * workspace's only when the place is the organization's and the author can
   * open it (checked by the insert). Null when that check failed; a name
   * already set at the place surfaces as `isUniqueViolation`.
   */
  createEnvVar(data: {
    id: string
    place: VariablePlace
    createdBy: string
    name: string
    value: string
    isSecret: boolean
    /** False when the caller lists the places next (`addEnvVarReach`); default true. */
    allPlaces?: boolean
  }): Promise<EnvVar | null>
  /** The organization's own rows, each with how many projects `visibleTo` can open set the name themselves. */
  listEnvVarsByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
  ): Promise<PaginatedResult<OrgEnvVar>>
  /** The project's own rows, not its workspaces'. */
  listEnvVarsByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>>
  listEnvVarsByWorkspace(
    organizationId: string,
    projectId: string,
    workspaceId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>>
  /** Each name once as the project resolves it (project over org), with where it is set and the viewer's workspaces that override it. */
  listResolvedVariablesForProject(
    organizationId: string,
    projectId: string,
    visibleTo?: string,
  ): Promise<ResolvedProjectVariable[]>
  /** Each name once as the workspace resolves it (workspace › project › org), with its source and what it overrides. */
  listResolvedVariablesForWorkspace(
    organizationId: string,
    projectId: string,
    workspaceId: string,
  ): Promise<ResolvedWorkspaceVariable[]>
  /**
   * Updates the row only where it is addressed (`place`): a row of another
   * level answers like a missing one. Null when no row matches — or when the
   * update would make a stored secret readable (isSecret flipped false with
   * no replacement value).
   */
  updateEnvVar(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean; allPlaces?: true },
  ): Promise<EnvVar | null>
  /**
   * Writes a project's or organization's variable that applies only to the
   * listed workspaces / projects, with its list, in one atomic batch. Places
   * that set their own value of the name are left out; nothing is written when
   * an id is not one of the level's places (`unknown`), the place cannot be
   * written (`missing`) or every listed place sets its own value (`taken`).
   * `reached` are the ids the variable now applies to; the rest were skipped.
   */
  createEnvVarWithReach(
    data: {
      id: string
      place: VariablePlace
      createdBy: string
      name: string
      value: string
      isSecret: boolean
    },
    placeIds: string[],
  ): Promise<{ row: EnvVar; reached: string[] } | { failure: 'missing' | 'unknown' | 'taken' }>
  /**
   * `updateEnvVar`, and the listed places added to the variable's list, in one
   * atomic batch. Never narrows: a variable that applies everywhere answers
   * `narrowing` and nothing is written; an id that is not one of its places
   * answers `unknown`; no such variable at `place` (or the secret refusal of
   * `updateEnvVar`) answers `missing`.
   */
  updateEnvVarWithReach(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean },
    placeIds: string[],
  ): Promise<{ row: EnvVar; reached: string[] } | { failure: 'missing' | 'unknown' | 'narrowing' }>
  /** Deletes the row where it is addressed — false when no row matched there. */
  /** The deleted variable's name; null when none at that place. */
  deleteEnvVar(id: string, place: VariablePlace): Promise<string | null>
  /** Whether the row at the addressed place is a secret — the un-hide refusal's one check. */
  isSecretVariableAt(id: string, place: VariablePlace): Promise<boolean>
  getWorkflowEnvVars(workflowId: string): Promise<WorkflowEnvVar[]>
  /** A workflow row's own variables, decoded; `getWorkflowEnvVars` reads the row first. */
  decodeWorkflowEnvVars(workflow: Workflow): Promise<WorkflowEnvVar[]>
  setWorkflowEnvVars(workflowId: string, vars: WorkflowEnvVar[]): Promise<void>
  /**
   * One row per name — the closest level's (workspace › project › org),
   * chosen in the statement — for the names set at the workspace, its
   * project or the org. Without a workspace, project and org; without a
   * project, the org alone (a workspace without its project is ignored).
   * Resolving a `{{global.env.X}}` reference to a
   * value is the caller's job: the form of a reference is defined in
   * `@awaitstep/ir`, which this package is standalone from.
   */
  findEnvVarsByNames(
    organizationId: string,
    names: readonly string[],
    projectId?: string | null,
    workspaceId?: string | null,
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
  /** Each installed node, its version, and how many workflows use it in their current version. */
  listNodeUsage(organizationId: string): Promise<NodeUsage[]>
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

  // Uploaded images: photos and logos (the `image` table)
  insertImage(row: ImageInsert): Promise<void>
  /** Several rows as one unit. */
  insertImages(rows: ImageInsert[]): Promise<void>
  /** The database store's write and read of a row's bytes. */
  setImageData(id: string, data: Uint8Array): Promise<void>
  getImageData(id: string): Promise<Uint8Array | null>
  /** The image to serve, while its owner's column still names it; null otherwise. */
  getImage(id: string): Promise<ServableImage | null>
  /**
   * Points the owner's column at the image, as one unit with listing the
   * owner's other stored images (the caller deletes them). `set` is false
   * when the owner or the image row is gone, or the row was claimed.
   */
  setOwnerImage(owner: ImageOwner, imageId: string): Promise<{ set: boolean; others: string[] }>
  /** Clears the owner's column; every image the owner had stored, for the caller to delete. */
  clearOwnerImage(owner: ImageOwner): Promise<string[]>
  listOwnerImages(owner: ImageOwner): Promise<string[]>
  /** Rows written before `before` that no owner names, oldest first. */
  listUnreferencedImages(before: string, limit: number): Promise<string[]>
  /**
   * Claims rows no owner names for deletion: none can be pointed at after.
   * The ids claimed, whose bytes the caller deletes before `deleteImages`.
   */
  claimImages(ids: string[], at: string): Promise<string[]>
  /** Deletes claimed rows. */
  deleteImages(ids: string[]): Promise<void>
  /** Which of these ids still have a row. */
  existingImages(ids: string[]): Promise<string[]>
  /** Photos and logos still held inline as `data:` URLs. */
  listInlineImages(limit: number): Promise<InlineImageRow[]>
  /** Points moved owners at their new images and clears the rest, where they still hold `data:`. */
  replaceInlineImages(
    moved: { owner: ImageOwner; imageId: string }[],
    cleared: ImageOwner[],
  ): Promise<void>
  /** Clears photos and logos that are neither stored, inline, nor a provider avatar. */
  clearRemoteImages(): Promise<void>
}
