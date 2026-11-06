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
  /** Manifest of the project files the session is built from: `{ path: hash }`, at most 100. */
  files?: Record<string, string> | null
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
  /** The user who saved it; left out where there is none to name. */
  createdBy?: string
}

/** A list row with its author's name: null for rows from before authors were kept, or a removed person. */
export interface Authored {
  createdByName: string | null
}

export type WorkflowVersionListItem = WorkflowVersion & Authored

export interface UpdateVersionData {
  ir?: string
  locked?: number
  /** An undeployed version saved over in place takes its new saver… */
  createdBy?: string
  /** …and the time: for a draft, `created_at` reads as when it was last saved. */
  createdAt?: string
}
export type Connection = InferSelectModel<typeof connections>

/**
 * A connection a workflow is deployed with, and the version its newest
 * successful deploy there carries: its id (null once deleted) and number.
 */
export type DeployedConnection = Connection & {
  deployedVersionId: string | null
  deployedVersionNumber: number | null
}

/** How many of an organization's workflows use an installed node in their current version. */
export interface NodeUsage {
  nodeId: string
  /** The installed version. */
  version: string
  /** The installed bundle's own name, category and description (null when it carries none). */
  name: string | null
  category: string | null
  description: string | null
  usage: number
}

/** What a project has set up, for its empty pages. */
export interface ProjectSetupCounts {
  cloudflareConnected: boolean
  orgVariables: number
  projectVariables: number
  projectKeys: number
}

/** A token check as stored on a connection. */
export interface ConnectionTokenCheck {
  status: 'active' | 'invalid' | 'unchecked'
  expiresAt: string | null
  checkedAt: string | null
}

/** A new connection: what it is, and which projects it serves (every one unless narrowed). */
export interface ConnectionWrite {
  organizationId: string
  provider: string
  name: string
  /** Plain JSON; encrypted on the way in. */
  credentials: string
  /** Default true: serves every project, including ones created later. */
  allProjects?: boolean
  /** The organization's projects it serves when `allProjects` is false. */
  projectIds?: string[]
  token?: ConnectionTokenCheck
  /** Who reads the row the write answers with (see `ConnectionListOptions.visibleTo`). */
  visibleTo?: ConnectionListOptions['visibleTo']
}

/** A change to a connection: what is given changes; a project list replaces the old one. */
export interface ConnectionUpdate {
  organizationId: string
  /** Only when the connection is this project's own: a project admin replacing its token. */
  ownedBy?: string
  name?: string
  /** Plain JSON; encrypted on the way in. */
  credentials?: string
  allProjects?: boolean
  projectIds?: string[]
  token?: ConnectionTokenCheck
  visibleTo?: ConnectionListOptions['visibleTo']
}

export interface ConnectionListOptions {
  cursor?: string | null
  limit?: number
  /** Only this connection: the row a write just made, in the list's shape. */
  id?: string
  /** Only connections serving this project of the organization, by id or slug. */
  project?: { id: string } | { slug: string }
  /** Who reads the project names: a person sees the projects they can open, a project-level key its own. */
  visibleTo?: 'all' | { userId: string } | { projectId: string } | { projectIds: string[] }
}

/** A connection as the dashboard lists it (credentials decrypted; the route redacts them). */
export interface ConnectionListRow extends Connection {
  createdByName: string | null
  allProjects: boolean
  projects: { id: string; name: string; slug: string }[]
  hiddenProjects: number
  deployments: { count: number; lastAt: string | null }
}

export interface ConnectionCoverage {
  connection: Connection
  /** Whether it is one of the project's accounts (added or owned, and still serving it). */
  covered: boolean
}

/** One of a project's accounts as its Connections page lists it; credentials decrypted. */
export interface ProjectConnectionRow {
  id: string
  provider: string
  name: string
  credentials: string
  createdByName: string | null
  scope: 'shared' | 'project'
  tokenStatus: string
  tokenExpiresAt: string | null
  isDefault: boolean
  available: boolean
  deployments: { count: number; lastAt: string | null }
  deployedFrom: string[]
  addedAt: string
}

export interface ProjectWorkspaceConnectionRow {
  workspaceId: string
  name: string
  connectionId: string | null
  connectionName: string | null
  source: 'override' | 'default' | 'none'
  lastDeployAt: string | null
}

export interface ProjectConnectionsRows {
  connections: ProjectConnectionRow[]
  workspaces: ProjectWorkspaceConnectionRow[]
}

/** An organization account as a project's Add connection lists it; credentials decrypted. */
export interface AvailableConnectionRow {
  id: string
  provider: string
  name: string
  credentials: string
  tokenStatus: string
  tokenExpiresAt: string | null
  state: 'added' | 'available' | 'restricted'
  restrictedTo: string[]
}

/** An account Deploy offers; `chosen` marks the workspace's, else the project's, default. */
export interface DeployTargetRow {
  id: string
  provider: string
  name: string
  credentials: string
  scope: 'shared' | 'project'
  tokenStatus: string
  tokenExpiresAt: string | null
  chosen: boolean
}

/** A new account connected from a project: always its own (accounts for the whole org are added on the org's page). */
export interface ProjectConnectionCreate {
  id: string
  projectId: string
  organizationId: string
  createdBy: string
  provider: string
  name: string
  /** Plain JSON; encrypted on the way in. */
  credentials: string
  token?: ConnectionTokenCheck
  makeDefault: boolean
}

export interface ProjectConnectionRemoval {
  name: string
  owned: boolean
  wasDefault: boolean
  /** Workspaces that deployed to it and now follow the project default. */
  workspacesCleared: number
  /**
   * An owned account workflows are still deployed with is kept: their names.
   * Empty when it was removed.
   */
  blockedBy: string[]
  /** As `blockedBy`, workflows in other projects (moved since): counted, never named. */
  blockedElsewhere: number
}

/** What a workspace's account change found: null fields name what refused it. */
export interface WorkspaceConnectionChange {
  /** Null: the workspace isn't the project's. */
  workspaceName: string | null
  /** Null when clearing, or when the account isn't one of the project's. */
  connectionName: string | null
  changed: boolean
}

export interface ExpiringConnectionsCheck {
  /** Each row's id is `<idPrefix>_<connection id>_<user id>_<expiry>_<7d|1d>`. */
  idPrefix: string
  event: string
  kind: NotificationKindValue
  needsAction: boolean
  now: string
  warnBefore: string
  lastWarnBefore: string
}
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
  /** Where the workflow lives, for the Inbox when a run fails. Null parts where none is set. */
  place: {
    organizationId: string | null
    orgSlug: string | null
    projectId: string | null
    projectSlug: string | null
    projectName: string | null
    workspaceId: string | null
    workspaceSlug: string | null
    workspaceName: string | null
  }
}
export type Deployment = InferSelectModel<typeof deployments>
export type DeploymentListItem = Deployment &
  Authored & {
    /** The deployed version's number (kept after the version is deleted) and its lock (null then). */
    version: number | null
    versionLocked: number | null
  }
export type ApiKey = InferSelectModel<typeof apiKeys>

/** One project a project-level key reaches, with whether that slice has been revoked. */
export interface ApiKeyProjectScope {
  projectId: string
  projectName: string | null
  projectSlug: string | null
  revokedAt: string | null
}

/** One workspace a workspace-level key reaches, with whether that slice has been revoked. */
export interface ApiKeyWorkspaceScope {
  workspace: WorkspaceChip
  revokedAt: string | null
}

/**
 * An API key as request-time auth reads it: the row (its organization is
 * always set now), whether its creator is still a member of that
 * organization, whether the key that minted it is still live, and the key's
 * LIVE scope set — the project or workspace ids it still reaches. The
 * addressed place is matched against that set; the creator's standing on the
 * place is resolved per-request by the scope middleware, so no per-scope
 * grant travels on this shape.
 */
export type ApiKeyAuth = ApiKey & {
  createdByIsMember: boolean
  /** The creator's role in the key's organization: a key acts with the standing of whoever minted it. */
  createdByRole: string | null
  parentKeyLive: boolean
  /** Live (unrevoked) project ids a project-level key reaches; empty for the other levels. */
  projectScopes: string[]
  /** Live (unrevoked) workspace ids a workspace-level key reaches; empty for the other levels. */
  workspaceScopes: string[]
  /** A workspace-level key's owning project (its workspaces are all of one); null otherwise. */
  keyProjectId: string | null
}

/**
 * A listed key: who minted it and the full scope set it carries — each
 * project or workspace with its own revoked state, so a page can show which
 * slices are live and offer to revoke the ones it owns.
 */
export type ApiKeyListItem = ApiKey & {
  createdByName: string | null
  /** The project scope set (project-level keys); empty for the other levels. */
  projects: ApiKeyProjectScope[]
  /** The workspace scope set (workspace-level keys); empty for the other levels. */
  workspaces: ApiKeyWorkspaceScope[]
}

/**
 * What a key is minted as: its level, the scope SET it reaches, and the grid
 * it carries. A multi-scope key is a set of >1; a single scope is a set of
 * one — the same code path. Every key carries its organization (the binding).
 */
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
  | { level: 'project'; organizationId: string; projectIds: string[] }
  | { level: 'workspace'; organizationId: string; projectId: string; workspaceIds: string[] }
)

/** The whole-key kill-switch: the owner revokes every scope at once, from the key's home level. */
export type ApiKeyTarget =
  | { level: 'organization'; organizationId: string }
  | { level: 'project'; projectId: string }
  | { level: 'workspace'; workspaceId: string }

/** One consumer revoking its own slice of a shared key: the key and the single place. */
export type ApiKeyScopeTarget =
  | { level: 'project'; keyId: string; projectId: string }
  | { level: 'workspace'; keyId: string; workspaceId: string }

/** The "Workspace keys" card on a project's keys page: live keys reaching each workspace. */
export interface WorkspaceKeyCount {
  workspace: WorkspaceChip
  count: number
}

/** A keys page split into the keys that live here and the ones reaching in from elsewhere. */
export interface ApiKeyScopedRows {
  own: ApiKeyListItem[]
  reaching: ApiKeyListItem[]
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

/** A workspace (on a project's variable) or a project (on an organization's) a variable can reach. */
export interface VariableReachPlace {
  id: string
  slug: string
  name: string
}

/**
 * Where a project's or an organization's variable applies: every workspace
 * (project) or project (organization), or only the listed ones. `blocked`
 * holds the ids of places that set their own value of the name, which the
 * variable can never reach or be extended to.
 */
export interface VariableReach {
  all: boolean
  places: VariableReachPlace[]
  blocked: string[]
}

/** What a write asks for: every place, or exactly these (never fewer than before). */
export type VariableReachInput = { all: true } | { all: false; ids: string[] }

/** An org-wide variable with how many projects (the viewer can open) set their own value. */
export type OrgEnvVar = EnvVar & { overriddenIn: number; reach: VariableReach }

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
  /** Where the project's own variable applies; null on an inherited organization one. */
  reach: VariableReach | null
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

/** The caller's own grants in an organization, oldest first; empty for an owner or admin. */
export interface OrgGrants {
  projects: { name: string; role: string }[]
  workspaces: { name: string; projectName: string; role: string }[]
}

/** An organization on the caller's list: its overview plus their grants and its health. */
export interface OrgListing extends OrgOverview {
  grants: OrgGrants
  /** Over the workspaces the caller can open: failing workflows and the last run. */
  health: { failing: number; lastRunAt: string | null }
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

/**
 * A project's or workspace's deletion lock as a write left it: all null when
 * off. `changed` is false when the lock was already in the asked-for state,
 * so the audit log records real changes only.
 */
export interface LockRow {
  lockedBy: string | null
  lockedAt: string | null
  lockedByName: string | null
  changed: boolean
}

/**
 * A workflow's share to its project as a write left it; the sharer's name
 * while they are in the org. `changed` as on `LockRow`.
 */
export interface SharingRow {
  sharedBy: string | null
  sharedAt: string | null
  sharedByName: string | null
  changed: boolean
}

/**
 * A workflow or function shared to its project, as anyone in the project
 * lists it: what it is and where it lives, never its code. `viewerRole` is
 * the viewer's role in the owning workspace, null when they cannot open it.
 */
export interface SharedWorkflowRow {
  id: string
  name: string
  kind: 'workflow' | 'script'
  deployedVersion: number | null
  sharedAt: string
  sharedBy: string
  sharedByName: string | null
  from: { id: string; slug: string; name: string; colour: string }
  viewerRole: WorkspaceGrant | null
}

/** Which shared items a list reads: the project's, optionally leaving out one workspace's own. */
export interface SharedWorkflowFilter {
  projectId: string
  organizationId: string
  viewer: string
  /** "Shared with Sales": every workspace's but this one's. */
  exceptWorkspaceId?: string
  kind?: 'workflow' | 'script'
}

/** One audit-log row as the API writes it: the words already rendered, the facts as JSON. */
export interface AuditEventInsert {
  id: string
  organizationId: string
  projectId: string | null
  workspaceId: string | null
  level: 'organization' | 'project' | 'workspace'
  kind: 'danger' | 'key' | 'access' | 'deploy' | 'auth' | 'lock'
  event: string
  actorType: 'user' | 'key'
  actorId: string
  actorName: string
  /** The person's address when they acted; null for a key. */
  actorEmail: string | null
  action: string
  target: string
  detail: string
  meta: string
  ip: string | null
  createdAt: string
}

/**
 * An event about the person themselves — a sign-in, a session signed out —
 * written once in each organization they are in.
 */
export interface PersonAuditInsert {
  /** Makes each row's id: `<idPrefix>_<organization id>`. */
  idPrefix: string
  userId: string
  event: string
  /** Defaults to `auth`. */
  kind?: string
  action: string
  /** The row's target; each organization's own name when omitted. */
  target?: string
  detail: string
  /** The facts as JSON; `{}` when omitted. */
  meta?: string
  ip: string | null
  createdAt: string
}

/** An audit-log row as the log lists it, its scope named from what exists now. */
export interface AuditEventRow {
  id: string
  at: string
  kind: AuditEventInsert['kind']
  event: string
  actor: string
  actorType: AuditEventInsert['actorType']
  /** Who acted, by id and (for a person) address: the name is theirs to choose. */
  actorId: string
  actorEmail: string | null
  action: string
  target: string
  detail: string
  ip: string | null
  scope: {
    level: AuditEventInsert['level']
    name: string
    colour: string | null
  }
}

export interface AuditListFilter {
  organizationId: string
  level?: AuditEventInsert['level']
  /** Only events at or after this instant. */
  since: string
  /** Matches the actor, the action and the target, ignoring case. */
  search?: string
  /** Events never listed (markers). */
  hiddenEvents: readonly string[]
}

/** An audit page with the number of events the filter matches across every page. */
export interface AuditEventPage {
  data: AuditEventRow[]
  nextCursor: string | null
  total: number
}

/** The actor's other open attempts inside the window. */
export interface FailureCount {
  failures: number
  lastFailureAt: string | null
}

/** Where a project move left the project, and the two organizations' names. */
export interface ProjectMoveOutcome {
  organizationId: string
  lockedAt: string | null
  /** Equals the stamp `moveProjectToOrganization` answered when that call moved it. */
  updatedAt: string
  fromName: string | null
  toName: string | null
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
  /** Its workflows and functions shared to the project. */
  sharedOut: number
  runs24h: number
  failing: number
  lastRunAt: string | null
}

/** One hour of a workspace's runs: started, finished well, failed. */
export interface RunHour {
  runs: number
  complete: number
  failed: number
}

export interface WorkspaceOverview extends Workspace {
  counts: WorkspaceCounts
  /** The last 24 hours, oldest first. Only the scope lookup reads it. */
  runsByHour?: RunHour[]
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
  /** Becomes the slug only while it is `default` and no sibling has it. */
  slugFromName?: string
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
  /** Only this workflow's runs (still only in the workspace). */
  workflowId?: string
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
  /**
   * With `workflowId`, on a first page (no cursor): that workflow's runs in each
   * of the last 24 hours, oldest first (its page's sparkline), whatever the
   * period. Absent otherwise.
   */
  byHour?: RunHour[]
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

/** A workspace grant as a write left it, with the person's name for the audit log (B7). */
/** `personName`: the person's name, or their email when the name is blank (for the audit log). */
export type NamedWorkspaceMember = WorkspaceMember & { personName: string | null }
export type NamedProjectMember = ProjectMember & { personName: string | null }

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

export interface WorkspaceAccess extends GrantRows, WorkspaceIds {
  /** The names the audit log records (B7), from the same read. */
  workspaceName: string
  projectName: string
}

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
  /**
   * How the audit log names the `userId` person (B7): their name, or their email
   * when the name is blank; null when none was asked or found.
   */
  name: string | null
  users: number
  projects: number
  workspaces: number
}

/** Why a project add was refused (`projectGrantRows`). */
export interface ProjectGrantRows {
  orgRole: string | null
  projectGrant: ProjectGrant | null
  /** They hold a grant in at least one of the project's workspaces. */
  workspaceGrants: boolean
  /** How many of the workspace ids asked about are the project's. */
  workspacesInProject: number
}

export interface ProjectGrantData {
  projectId: string
  userId: string
  role: ProjectGrant
  createdBy: string
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

/** An invitation waiting for the session's address, for /dashboard's "Waiting for you". */
export interface PendingInvitationRow {
  id: string
  org: { slug: string; name: string; logo: string | null }
  inviterName: string
  role: string
  expiresAt: string
  /** Where it leads, first one first, as the invite page names them. */
  places: InvitationPlaceRow[]
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

// Inbox (B8)

export type NotificationKindValue = 'failure' | 'request' | 'expiry' | 'people' | 'deploy'

/**
 * Who a notification goes to, before the organization filter: only people
 * in its organization who can still see its place receive it.
 */
export type NotificationRecipients =
  | { users: string[] }
  /** The workflow's creator and its workspace's admins (explicit grants). */
  | { workflowWatchers: { workflowId: string } }
  /** Admins (explicit grants) of the project's workspaces other than this one. */
  | { otherWorkspaceAdmins: { projectId: string; workspaceId: string } }
  /** Whoever can replace the connection's token: its creator and the org's owners and admins. */
  | { connectionKeepers: { connectionId: string } }

export interface NotificationInsert {
  /** Each row's id is `<idPrefix>_<recipient id>`. */
  idPrefix: string
  organizationId: string
  kind: NotificationKindValue
  event: string
  needsAction: boolean
  /** Repeats with the same key (per person) fold into one row. */
  groupKey: string
  projectId: string | null
  workspaceId: string | null
  accessRequestId?: string | null
  /** Facts the sentence is written from. Never a secret value. */
  meta: Record<string, unknown>
  recipients: NotificationRecipients
  /** The person who acted: never told about it. */
  excludeUserId?: string | null
  /** A repeat leaves the row (`keep`) or counts it again, unread (`fold`). */
  onRepeat: 'keep' | 'fold'
  now: string
}

/** A person a write reached; `count` 1 means the row is new in its group. */
export interface NotifiedRecipient {
  userId: string
  email: string
  name: string
  /** The organization's slug, for links in the email. */
  orgSlug: string
  count: number
}

export interface ExpiringKeysCheck {
  /** Each row's id is `<idPrefix>_<key id>_<7d|1d>`. */
  idPrefix: string
  event: string
  kind: NotificationKindValue
  needsAction: boolean
  now: string
  /** Keys expiring before this are warned once. */
  warnBefore: string
  /** …and once more before this. */
  lastWarnBefore: string
}

/** A notification as the Inbox reads it, before it is put in words. */
export interface NotificationListRow {
  id: string
  event: string
  count: number
  meta: Record<string, unknown>
  at: string
  read: boolean
  needsAction: boolean
  place: {
    level: 'organization' | 'project' | 'workspace'
    orgName: string
    projectSlug: string | null
    projectName: string | null
    workspaceSlug: string | null
    workspaceName: string | null
  }
  request: {
    id: string
    status: 'pending' | 'approved' | 'declined'
    asker: string
    /** Approved when they could already edit: nothing was granted. */
    alreadyEditing: boolean
  } | null
}

export interface NotificationList {
  rows: NotificationListRow[]
  counts: { all: number; unread: number; action: number }
}

/** When someone last closed What's new, and the notes it showed them. */
export interface ReleaseVisitRow {
  seenAt: string
  seenIds: string[]
}

/** "Your account" (B10): the person, their organizations and their linked providers, in one row. */
export interface AccountRow {
  person: { id: string; name: string; email: string; image: string | null; emailVerified: boolean }
  orgs: {
    id: string
    slug: string
    name: string
    logo: string | null
    role: string
    projectCount: number
    onlyOwner: boolean
  }[]
  /** Each linked provider (`github`, `google`) and when it was linked. */
  providers: { id: string; providerId: string; connectedAt: string }[]
}

/** A session as the Sessions page lists it, before its user agent and address are read. */
export interface AccountSessionRow {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  updatedAt: string
  current: boolean
}

/** Download JSON's rows: the person's own, nothing their organizations own. */
export interface AccountExportRow {
  name: string
  email: string
  photo: boolean
  providers: { id: string; providerId: string; connectedAt: string }[]
  sessions: AccountSessionRow[]
  memberships: {
    organization: string
    role: string
    projects: { name: string; role: string }[]
    workspaces: { project: string; name: string; role: string }[]
  }[]
}

/** Whose an uploaded image is: a person's photo or an organization's logo. */
export type ImageOwnerKind = 'user' | 'org'

export interface ImageOwner {
  kind: ImageOwnerKind
  id: string
}

/** A new `image` row; `data` only when the database store keeps the bytes. */
export interface ImageInsert {
  id: string
  ownerKind: ImageOwnerKind
  ownerId: string
  contentType: string
  bytesLen: number
  width: number
  height: number
  createdAt: string
  data?: Uint8Array | null
}

/** An image its owner still names, as `/api/images/:id` serves it. */
export interface ServableImage {
  contentType: string
  bytesLen: number
  /** The bytes when the row holds them (the database store), else null. */
  data: Uint8Array | null
}

/** A photo or logo still held inline as a `data:` URL. */
export interface InlineImageRow {
  ownerKind: ImageOwnerKind
  ownerId: string
  value: string
}
