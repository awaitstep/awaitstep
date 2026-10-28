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
  parentKeyLive: boolean
}
/** A listed key with its project's name joined in — null on org-level keys. */
export type ApiKeyListItem = ApiKey & { projectName: string | null }
export type EnvVar = InferSelectModel<typeof envVars>
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
  /** Oldest first: the order the switcher shows. */
  workspaces: WorkspaceChip[]
  health: ProjectHealth
  lockedByName: string | null
  /** Who can open it — every member of the organization until B2 adds roles. */
  members: OrgMemberSummary[]
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
  members: OrgMemberSummary[]
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
