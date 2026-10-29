import type { InferSelectModel } from 'drizzle-orm'
import type { workflows } from './schema/sqlite/workflows.js'
import type { workflowVersions } from './schema/sqlite/versions.js'
import type { connections } from './schema/sqlite/connections.js'
import type { workflowRuns } from './schema/sqlite/runs.js'
import type { workflowRunSteps } from './schema/sqlite/run-steps.js'
import type { deployments } from './schema/sqlite/deployments.js'
import type { apiKeys } from './schema/sqlite/api-keys.js'
import type { envVars } from './schema/sqlite/env-vars.js'
import type { projects } from './schema/sqlite/projects.js'
import type { workspaces } from './schema/sqlite/workspaces.js'
import type { installedNodes } from './schema/sqlite/installed-nodes.js'
import type { deploymentConfigs } from './schema/sqlite/deployment-configs.js'
import type { workflowFiles } from './schema/sqlite/workflow-files.js'
import type { testSessions } from './schema/sqlite/test-sessions.js'
import type { invitation } from './schema/sqlite/auth.js'
import type {
  projectMembers,
  workspaceMembers,
  invitationPlaces,
  accessRequests,
} from './schema/sqlite/access.js'

/**
 * `workspaceId` is always set: the migration filled it and the adapter never
 * writes null. SQLite's column stays nullable only because adding NOT NULL
 * there means rebuilding the table (the Phase-2 cleanup migration).
 */
export type Workflow = Omit<InferSelectModel<typeof workflows>, 'workspaceId'> & {
  workspaceId: string
}

/** A project-owned file; `hash` is the content hash the API serves as its ETag. */
export type WorkflowFile = InferSelectModel<typeof workflowFiles>
/** A project file without its text: what a listing needs. */
export type WorkflowFileSummary = Omit<WorkflowFile, 'source'>

export interface UpsertWorkflowFileData {
  id: string
  workflowId: string
  path: string
  source: string
  hash: string
  /** UTF-8 byte size of `source`. */
  size: number
}

/** A disposable worker running a workflow before it is deployed. */
export type TestSession = InferSelectModel<typeof testSessions>
export type TestSessionStatus = TestSession['status']

/** What a session is recorded with, before its container exists. */
export interface ReserveTestSessionData {
  id: string
  workflowId: string
  versionId?: string | null
  userId: string
  runtime: TestSession['runtime']
  containerId: string
}

/**
 * The instants that separate a live session from an expired one. Produced by
 * the API's session policy, so TTL is never stored on a row: queries that
 * select live sessions compare strictly after these, and the reaper's query
 * compares at-or-before them — exact complements, so the two can never
 * disagree about a session on the boundary.
 */
export interface TestSessionCutoffs {
  /** A running session used at or before this is idle. */
  idle: string
  /** A session created at or before this has outlived its hard lifetime. */
  started: string
  /** A session still `starting` at or before this never came up. */
  starting: string
}

/** The caps a reservation has to fit inside, evaluated in the statement. */
export interface ReserveTestSessionLimits {
  cutoffs: TestSessionCutoffs
  /** Project the quota applies to; resolved through the session's workflow. */
  projectId: string
  /** Unfinished sessions this user may hold, counted across every project. */
  maxConcurrentPerUser: number
  /** Unfinished sessions everyone may hold together — the container pool. */
  maxConcurrentTotal: number
  /** Sessions the project may start inside the quota window. */
  maxPerWindowPerProject: number
  quotaWindowStart: string
}

/**
 * Why a session should be stopped, or `null` while it may keep running.
 * Computed in SQL and returned as a column, so nothing above the adapter
 * parses a stored timestamp.
 */
export type TestSessionExpiry = 'idle' | 'lifetime' | 'start-timeout' | null

/**
 * A session with the workflow it belongs to, resolved in one query. Access is
 * verified through the workflow's project, never a column on the session.
 */
export interface OwnedTestSession {
  session: TestSession
  workflow: Workflow
  expiry: TestSessionExpiry
}

/** A session the reaper should stop, with the reason to report. */
export interface ExpiringTestSession {
  session: TestSession
  expiry: TestSessionExpiry
}

/** Counts the session policy needs, both from a single query. */
export interface TestSessionUsage {
  /**
   * Sessions this user holds anywhere that may still own a container —
   * starting and running both count, including ones already past their
   * cut-offs, because an unreaped session is still billing.
   */
  activeForUser: number
  /** Unfinished sessions held by everyone — the shared container pool. */
  activeEverywhere: number
  /** Sessions created in the project since the quota window opened. */
  createdInWindow: number
}
export type WorkflowVersion = InferSelectModel<typeof workflowVersions>

export interface CreateVersionData {
  id: string
  workflowId: string
  /**
   * Omit to have the adapter assign MAX(version)+1 atomically in SQL —
   * callers that read the next number first race under concurrency and trip
   * the (workflowId, version) unique index.
   */
  version?: number
  ir: string
}

export interface UpdateVersionData {
  ir?: string
  locked?: number
}
export type Connection = InferSelectModel<typeof connections>
export type WorkflowRun = InferSelectModel<typeof workflowRuns>
export type WorkflowRunStep = InferSelectModel<typeof workflowRunSteps>

/** Provider step record kinds persisted per run ('do' covers plain steps). */
export type RunStepKind = 'do' | 'sleep' | 'waitForEvent' | 'rollback'

export type RunStepStatus = 'running' | 'waiting' | 'complete' | 'errored'

/**
 * One provider-reported step occurrence, upserted by its stable identity
 * (runId, stepName, kind, stepIndex) so repeated syncs converge instead of
 * duplicating rows.
 */
export interface UpsertRunStepData {
  id: string
  nodeId?: string | null
  stepName: string
  kind: RunStepKind
  stepIndex: number
  status: RunStepStatus
  attemptCount: number
  error?: string | null
  startedAt?: string | null
  endedAt?: string | null
}

/** A run's step rows plus the deployed version's config snapshot (manifest carrier). */
export interface RunStepsResult {
  steps: WorkflowRunStep[]
  configSnapshot: string | null
}

/**
 * An active (non-terminal) run joined with everything one sync tick needs:
 * the provider workflow name and the deployed version's config snapshot
 * (which carries the step manifest). Credentials stay out — they decrypt
 * through the connections adapter, once per connection group.
 */
export interface ActiveRunForSync {
  run: WorkflowRun
  workflowName: string
  configSnapshot: string | null
}
export type Deployment = InferSelectModel<typeof deployments>
export type ApiKey = InferSelectModel<typeof apiKeys>
/**
 * An API key as auth reads it: with its organization resolved from either
 * source (its own, or its project's), whether its creator is still a member
 * of that organization, and whether the key that minted it (if any) is still
 * unrevoked and unexpired.
 */
export type ApiKeyAuth = ApiKey & {
  resolvedOrganizationId: string | null
  createdByIsMember: boolean
  /** The creator's role in that organization: a key acts with the standing of whoever minted it. */
  createdByRole: string | null
  /** For a project key: the creator's `project_members` row there, if any. */
  createdByProjectGrant: ProjectGrant | null
  /** For a project key: whether the creator holds a grant in any of its workspaces. */
  createdByHasWorkspaceGrant: boolean
  /** For a workspace key: whether the creator can still open that workspace; true for the other levels. */
  createdByCanOpenWorkspace: boolean
  parentKeyLive: boolean
}
/** A listed key: its project's name (null on organization keys), who minted it, and its workspace (workspace keys). */
export type ApiKeyListItem = ApiKey & {
  projectName: string | null
  createdByName: string | null
  workspace: WorkspaceChip | null
}

/** What a key is minted as (B3): its level, where, and the grid it carries. */
export type CreateApiKeyData = {
  id: string
  createdBy: string
  name: string
  keyHash: string
  keyPrefix: string
  /** The secret's last four characters, for the "ask_p1…a71d" display. */
  keySuffix?: string | null
  /** The grid as JSON, from @awaitstep/ir's catalog for the level. */
  permissions: string
  /** The coarse scopes the grid amounts to, for the column older keys were checked by. */
  scopes: string
  expiresAt?: string | null
  parentKeyId?: string | null
} & (
  | { level: 'organization'; organizationId: string }
  | { level: 'project'; organizationId: string; projectId: string }
  | { level: 'workspace'; organizationId: string; projectId: string; workspaceId: string }
)

/** Where a key is revoked from: its own level's place. */
export type ApiKeyTarget =
  | { level: 'organization'; organizationId: string }
  | { level: 'project'; projectId: string }
  | { level: 'workspace'; workspaceId: string }

/** The "Workspace keys" card on a project's keys page: unrevoked keys per workspace. */
export interface WorkspaceKeyCount {
  workspace: WorkspaceChip
  count: number
}

/** Workspace settings → API keys: the workspace's own keys and the project keys that reach it. */
export interface WorkspaceKeysRows {
  own: ApiKeyListItem[]
  inherited: ApiKeyListItem[]
}
export type EnvVar = InferSelectModel<typeof envVars>

// Variables at three levels (B4). A row's level is read off its columns:
// `workspaceId` → workspace, `projectId` → project, else the organization.

export type VariableLevel = 'organization' | 'project' | 'workspace'

/** Where a variable is set or addressed: the level and the ids a statement pins to. */
export type VariablePlace =
  | { level: 'organization'; organizationId: string }
  | { level: 'project'; organizationId: string; projectId: string }
  | { level: 'workspace'; organizationId: string; projectId: string; workspaceId: string }

/** An org-wide variable with how many projects (the viewer can open) set their own value. */
export type OrgEnvVar = EnvVar & { overriddenIn: number }

/** The place a resolved value comes from; `name` is null in a schema without the org table. */
export interface VariableSource {
  level: VariableLevel
  id: string
  name: string | null
}

/** Project settings → Variables: each name once, the project's value over the org's. */
export type ResolvedProjectVariable = EnvVar & {
  level: 'organization' | 'project'
  setAt: VariableSource
  /** The workspaces the viewer can open that set their own value. */
  overriddenIn: WorkspaceChip[]
}

/** Workspace settings → Variables: each name once, the closest level winning. */
export type ResolvedWorkspaceVariable = EnvVar & {
  level: VariableLevel
  source: VariableSource
  /** The level whose value this one replaces, when it replaces one. */
  overrides: 'project' | 'organization' | null
}
export type Project = InferSelectModel<typeof projects>
export type Workspace = InferSelectModel<typeof workspaces>
export type InstalledNode = InferSelectModel<typeof installedNodes>
export type DeploymentConfig = InferSelectModel<typeof deploymentConfigs>

// Dashboard scope (B1): what `/{org}/{project}/{workspace}` names, with the
// counts and lists each level's record shows, read in one statement.

export interface ScopeSlugs {
  org: string
  project?: string
  workspace?: string
}

/** A project named by id, or by its organization's slug and its own. */
export type ProjectRef = { id: string } | { org: string; slug: string }

/** A workspace named by id, or by the three slugs of its URL. */
export type WorkspaceRef = { id: string } | { org: string; project: string; workspace: string }

/** A workspace within a project the caller already holds: by id or by slug. */
export type WorkspaceInProjectRef = { id: string } | { slug: string }

export interface OrgMemberSummary {
  id: string
  name: string
  email: string
  image: string | null
  role: string
}

export interface OrgOverview {
  id: string
  slug: string
  name: string
  logo: string | null
  createdAt: string
  /** The caller's role in it. */
  viewerRole: string
  /** Projects the caller can open. */
  projectCount: number
  memberCount: number
}

export interface WorkspaceChip {
  id: string
  slug: string
  name: string
  colour: string
}

export interface ProjectHealth {
  workflows: number
  /** Workflows whose latest deployment succeeded. */
  deployed: number
  /** Workflows and functions whose latest run failed. */
  failing: number
  lastRunAt: string | null
}

export interface ProjectOverview extends Project {
  /** Oldest first: the workspaces the viewer can open. */
  workspaces: WorkspaceChip[]
  /** Over the workspaces the viewer can open: a hidden one adds nothing. */
  health: ProjectHealth
  lockedByName: string | null
  /** Its workspaces locked on their own, by name, oldest first (seen or not). */
  lockedWorkspaces: string[]
  /** Who can open a workspace the viewer can open, with their org role. */
  members: OrgMemberSummary[]
  /** The viewer's own rows here. */
  viewer: GrantRows
}

/** A project's or workspace's deletion lock as a write left it: all null when off. */
export interface LockRow {
  lockedBy: string | null
  lockedAt: string | null
  lockedByName: string | null
}

/** What stands in the way of deleting a project. */
export interface ProjectLocks {
  ownLock: boolean
  lockedWorkspaces: string[]
}

/** What stands in the way of deleting a workspace. */
export interface WorkspaceLocks {
  ownLock: boolean
  /** The project's name when the project is locked. */
  lockedByProject: string | null
  isLastWorkspace: boolean
}

export interface WorkspaceCounts {
  workflows: number
  deployed: number
  functions: number
  runs24h: number
  failing: number
  lastRunAt: string | null
}

export interface WorkspaceOverview extends Workspace {
  counts: WorkspaceCounts
  createdByName: string | null
  lockedByName: string | null
  projectName: string
  /** The project's own lock, which covers every workspace in it. */
  projectLockedAt: string | null
  /** Workspaces in the project, this one included: 1 means it is the last. */
  siblings: number
  /** Everyone who can open it, with the rows their role comes from. */
  members: WorkspacePersonRow[]
  /** The viewer's own rows here. */
  viewer: GrantRows
}

export interface ScopeRows {
  org: OrgOverview & { members: OrgMemberSummary[] }
  /** Null when no project slug was asked for, or none matched. */
  project: ProjectOverview | null
  workspace: WorkspaceOverview | null
}

export interface WorkspaceIds {
  workspaceId: string
  projectId: string
  organizationId: string
}

/** A membership lookup's answer carries the caller's role in the organization. */
export interface MemberRole {
  /** As better-auth stores it: `owner`, `admin`, `member`, or a comma-joined list. */
  role: string
}

export interface CreateWorkspaceData {
  id: string
  projectId: string
  name: string
  slug: string
  description?: string | null
  colour?: string
  createdBy?: string | null
}

export interface UpdateWorkspaceData {
  name?: string
  slug?: string
  description?: string | null
  colour?: string
}

export type RunResultFilter = 'succeeded' | 'failed' | 'running'

export interface WorkspaceRunFilter {
  result?: RunResultFilter
  /** Runs created at or after this instant. */
  since?: string
  /** Matches the workflow name or the run id, case-insensitively. */
  search?: string
  cursor?: string
  limit?: number
}

export interface WorkspaceRunRow extends WorkflowRun {
  workflowName: string
  kind: 'workflow' | 'script'
}

export interface WorkspaceRunPage {
  data: WorkspaceRunRow[]
  nextCursor: string | null
  /** Over the period and search, before the result filter: the filter pills. */
  counts: { all: number; succeeded: number; failed: number; running: number }
}

/** A workflow whose latest run failed, with where it lives and that run. */
export interface FailingWorkflow {
  workflow: { id: string; name: string; kind: 'workflow' | 'script' }
  project: { slug: string; name: string }
  workspace: { slug: string; name: string; colour: string }
  run: WorkflowRun
}

// Access below the organization (B2): the membership rows one person's
// standing comes from, and what the people pages read. The role table that
// turns rows into roles is `resolveRoles` in @awaitstep/ir; the adapters
// render the same table as SQL (`RoleFields`) to hide what someone may not
// open, and hand the rows up so the API resolves the roles it answers with.

export type ProjectMember = InferSelectModel<typeof projectMembers>
export type WorkspaceMember = InferSelectModel<typeof workspaceMembers>
export type InvitationPlace = InferSelectModel<typeof invitationPlaces>
export type AccessRequest = InferSelectModel<typeof accessRequests>
export type Invitation = InferSelectModel<typeof invitation>

export type ProjectGrant = ProjectMember['role']
export type WorkspaceGrant = WorkspaceMember['role']

/** The rows behind one person's standing at one place; null where there is no row. */
export interface GrantRows {
  /** As better-auth stores it (`owner`, `admin`, `member`); null outside the organization. */
  orgRole: string | null
  projectGrant: ProjectGrant | null
  workspaceGrant: WorkspaceGrant | null
}

/** A project the caller can open, with their rows there; `workspace` when one was asked for. */
export interface ProjectAccess extends GrantRows {
  project: Project
  workspace: WorkspaceChip | null
}

export interface WorkspaceAccess extends GrantRows, WorkspaceIds {}

/** A workflow the caller can open, with their rows in its workspace. */
export interface WorkflowAccess extends GrantRows {
  workflow: Workflow
  organizationId: string
}

/** Someone who can open a workspace, with the rows their role there comes from. */
export interface WorkspacePersonRow extends GrantRows {
  id: string
  name: string
  email: string
  image: string | null
  /** Their latest session's activity, or null. */
  lastActiveAt: string | null
}

/** One row of Project settings → Members: everyone who can open any of its workspaces. */
export interface ProjectMemberRow {
  id: string
  name: string
  email: string
  image: string | null
  orgRole: string
  projectGrant: ProjectGrant | null
  /** Their grants in the project's workspaces the viewer can open. */
  workspaces: (WorkspaceChip & { role: WorkspaceGrant })[]
}

/** One place an org member can work, for the Members page's "Has access to". */
export interface OrgMemberPlace {
  projectId: string
  projectName: string
  workspaceCount: number
  /** Null for a project-wide role. */
  workspaceId: string | null
  workspaceName: string | null
  role: string
}

export interface OrgMemberRow {
  id: string
  name: string
  email: string
  image: string | null
  role: string
  joinedAt: string
  /** Only in projects the viewer can open. */
  places: OrgMemberPlace[]
}

/** What the access editor loads: the person, every project with its workspaces, and their rows. */
export interface PersonAccessRows {
  person: { id: string; name: string; email: string; image: string | null }
  role: string
  joinedAt: string
  projects: { id: string; name: string; workspaces: WorkspaceChip[] }[]
  projectGrants: { projectId: string; role: ProjectGrant }[]
  workspaceGrants: { workspaceId: string; role: WorkspaceGrant }[]
}

/** What saving the access editor writes: the org role and the rows that replace theirs. */
export interface AccessGrantData {
  orgRole: string
  projects: { projectId: string; role: ProjectGrant }[]
  workspaces: { workspaceId: string; role: WorkspaceGrant }[]
}

/**
 * One read before a write that names ids: how many of the named projects,
 * workspaces and people are the organization's, and the role of one person
 * in it (null when no `userId` was asked about, or they are not a member).
 */
export interface InOrgCheck {
  role: string | null
  users: number
  projects: number
  workspaces: number
}

export interface WorkspaceGrantData {
  workspaceId: string
  userId: string
  role: WorkspaceGrant
  createdBy: string
}

export interface InvitationPlaceRow {
  projectId: string
  projectName: string
  projectSlug: string
  workspaceId: string | null
  workspaceName: string | null
  workspaceSlug: string | null
  role: string
}

/** A pending invitation as Org Members lists it. */
export interface InvitationRow {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
  createdAt: string
  askedForNewAt: string | null
  inviter: { id: string; name: string }
  /** Only places in projects the viewer can open. */
  places: InvitationPlaceRow[]
}

/** An invitation as the invite page reads it: the row, its organization and inviter, every place. */
export interface InvitationView {
  invitation: Invitation
  org: { id: string; slug: string; name: string; logo: string | null }
  inviter: { id: string; name: string; email: string; image: string | null }
  places: InvitationPlaceRow[]
}

export interface CreateInvitationData {
  id: string
  organizationId: string
  email: string
  role: string
  inviterId: string
  expiresAt: string
  places: { id: string; projectId: string; workspaceId: string | null; role: string }[]
}

/**
 * One read before inviting: how many of the places' projects and workspaces
 * are the organization's, and which of the addresses are already members or
 * already have an open invitation (lowercased).
 */
export interface InvitationChecks {
  projects: number
  workspaces: number
  members: string[]
  pending: string[]
}

/** An invitation waiting for the session's address, for Choose an organization. */
export interface PendingInvitationRow {
  id: string
  org: { slug: string; name: string; logo: string | null }
  inviterName: string
  role: string
  expiresAt: string
}

export interface AcceptInvitationData {
  invitationId: string
  userId: string
  /** The member row's id, should one need creating. */
  memberId: string
  now: string
}

/** A Viewer's edit-access request with its two people named. */
export interface AccessRequestRow {
  id: string
  workspaceId: string
  from: { id: string; name: string }
  to: { id: string; name: string }
  status: AccessRequest['status']
  alreadyEditing: boolean
  createdAt: string
}

/** A request as the person it was sent to decides it: with where it is and the asker's standing now. */
export interface AccessRequestDecision {
  request: AccessRequest
  workspace: { id: string; name: string; projectId: string; organizationId: string }
  asker: GrantRows & { name: string }
  /** The rows of whoever is deciding, in the same workspace: whether they may. */
  decider: GrantRows
}
