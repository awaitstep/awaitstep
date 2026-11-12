import type {
  DatabaseAdapter,
  Workflow,
  WorkflowVersion,
  Connection,
  ConnectionListRow,
  ActiveRunForSync,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowFile,
  TestSession,
  TestSessionCutoffs,
  TestSessionExpiry,
  ApiKey,
  ApiKeyListItem,
  Deployment,
  DeploymentConfig,
  EnvVar,
  VariablePlace,
  Project,
  InstalledNode,
  Workspace,
  WorkspaceChip,
  WorkspaceOverview,
  ProjectOverview,
  WorkspaceRunRow,
  AuditEventInsert,
  PersonAuditInsert,
  NotificationInsert,
  RunTrigger,
} from '@awaitstep/db'
import type {
  GeneratedBundle,
  ProcessLogEntry,
  StartedTestSessionHandle,
  TestSessionRunner,
  TestSessionTarget,
} from '@awaitstep/codegen'
import { createApp, type AppDeps } from '../app.js'
import type { Auth } from '../auth/config.js'

const store = {
  workflows: new Map<string, Workflow>(),
  versions: new Map<string, WorkflowVersion>(),
  connections: new Map<string, Connection>(),
  runs: new Map<string, WorkflowRun>(),
  runSteps: new Map<string, WorkflowRunStep>(),
  files: new Map<string, WorkflowFile>(),
  testSessions: new Map<string, TestSession>(),
  deploymentConfigs: new Map<string, DeploymentConfig>(),
  apiKeys: new Map<string, ApiKey>(),
  apiKeyProjects: [] as { keyId: string; projectId: string; revokedAt: string | null }[],
  apiKeyWorkspaces: [] as { keyId: string; workspaceId: string; revokedAt: string | null }[],
  deployments: new Map<string, Deployment>(),
  projects: new Map<string, Project>(),
  workspaces: new Map<string, Workspace>(),
  installedNodes: new Map<string, InstalledNode>(),
  envVars: new Map<string, EnvVar>(),
  // Which workspaces (a project's variable) or projects (an organization's) a listed variable reaches.
  envVarReach: new Map<string, Set<string>>(),
  auditEvents: [] as AuditEventInsert[],
  personAuditEvents: [] as PersonAuditInsert[],
  notifications: [] as NotificationInsert[],
}

// Scope-set helpers for the API-key mock, mirroring the adapter's join tables.
const liveKeyProjects = (keyId: string) =>
  store.apiKeyProjects.filter((r) => r.keyId === keyId && !r.revokedAt).map((r) => r.projectId)
const liveKeyWorkspaces = (keyId: string) =>
  store.apiKeyWorkspaces.filter((r) => r.keyId === keyId && !r.revokedAt).map((r) => r.workspaceId)
const totalKeyProjects = (keyId: string) => store.apiKeyProjects.filter((r) => r.keyId === keyId)
const totalKeyWorkspaces = (keyId: string) =>
  store.apiKeyWorkspaces.filter((r) => r.keyId === keyId)
// A workspace key's workspaces are all of one project — its home project.
const keyWorkspaceProject = (keyId: string): string | null => {
  const first = totalKeyWorkspaces(keyId)[0]
  return first ? (store.workspaces.get(first.workspaceId)?.projectId ?? null) : null
}
const toKeyListItem = (k: ApiKey): ApiKeyListItem => ({
  ...k,
  createdByName: null,
  projects: store.apiKeyProjects
    .filter((r) => r.keyId === k.id)
    .map((r) => {
      const p = store.projects.get(r.projectId)
      return {
        projectId: r.projectId,
        projectName: p?.name ?? null,
        projectSlug: p?.slug ?? null,
        revokedAt: r.revokedAt,
      }
    }),
  workspaces: store.apiKeyWorkspaces
    .filter((r) => r.keyId === k.id)
    .map((r) => {
      const w = store.workspaces.get(r.workspaceId)
      return {
        workspace: {
          id: r.workspaceId,
          slug: w?.slug ?? '',
          name: w?.name ?? '',
          colour: w?.colour ?? 'green',
        },
        revokedAt: r.revokedAt,
      }
    }),
})

export function resetStore() {
  store.workflows.clear()
  store.versions.clear()
  store.connections.clear()
  store.runs.clear()
  store.runSteps.clear()
  store.files.clear()
  store.testSessions.clear()
  store.deploymentConfigs.clear()
  store.apiKeys.clear()
  store.apiKeyProjects.length = 0
  store.apiKeyWorkspaces.length = 0
  store.deployments.clear()
  store.projects.clear()
  store.workspaces.clear()
  store.installedNodes.clear()
  testOrgRole = 'owner'
  seedTestProject()
  store.envVars.clear()
  store.envVarReach.clear()
  store.auditEvents.length = 0
  store.personAuditEvents.length = 0
  store.notifications.length = 0
}

/** A workflow's place as the sync read gives it. */
function syncPlace(workflowId: string) {
  const wf = store.workflows.get(workflowId)
  const project = wf ? store.projects.get(wf.projectId) : undefined
  const workspace = wf?.workspaceId ? store.workspaces.get(wf.workspaceId) : undefined
  return {
    organizationId: project?.organizationId ?? null,
    orgSlug: project ? 'test-org' : null,
    projectId: project?.id ?? null,
    projectSlug: project?.slug ?? null,
    projectName: project?.name ?? null,
    workspaceId: workspace?.id ?? null,
    workspaceSlug: workspace?.slug ?? null,
    workspaceName: workspace?.name ?? null,
  }
}

function now() {
  return new Date().toISOString()
}

// A session whose workflow was deleted keeps its row (the container is still
// running) but belongs to no project any more.
function sessionProject(session: TestSession): string | null {
  return session.workflowId ? (store.workflows.get(session.workflowId)?.projectId ?? null) : null
}

// A session that may still own a container — what the cap counts and what
// the unique index covers.
function isUnfinishedSession(session: TestSession): boolean {
  return session.status === 'starting' || session.status === 'running'
}

// Mirrors the adapter's expiry CASE. Kept in one place here so the mock and
// the real adapter cannot disagree about the same row.
function sessionExpiry(session: TestSession, cutoffs: TestSessionCutoffs): TestSessionExpiry {
  if (!isUnfinishedSession(session)) return null
  if (session.status === 'starting') {
    return session.createdAt <= cutoffs.starting ? 'start-timeout' : null
  }
  if (session.createdAt <= cutoffs.started) return 'lifetime'
  if (session.lastUsedAt <= cutoffs.idle) return 'idle'
  return null
}

function isLiveSession(session: TestSession, cutoffs: TestSessionCutoffs): boolean {
  return isUnfinishedSession(session) && sessionExpiry(session, cutoffs) === null
}

/** Whether a stored variable sits at the place a write is addressed at (the adapter's pin). */
function envVarAtPlace(v: EnvVar, place: VariablePlace): boolean {
  if (v.organizationId !== place.organizationId) return false
  if (place.level === 'organization') return v.projectId === null
  if (place.level === 'project') return v.projectId === place.projectId && v.workspaceId === null
  return v.workspaceId === place.workspaceId
}

/** Whether a project's variable reaches the workspace, or an organization's the project. */
function envVarReaches(v: EnvVar, projectId: string | null, workspaceId?: string | null): boolean {
  if (v.allPlaces) return true
  const listed = store.envVarReach.get(v.id)
  if (v.workspaceId !== null) return true
  if (v.projectId === null) return !!projectId && !!listed?.has(projectId)
  return !workspaceId || !!listed?.has(workspaceId)
}

/** The adapter's `reach` for a row: the listed places that set no value of their own, and the ones that do. */
function envVarReach(v: EnvVar) {
  const rows = [...store.envVars.values()]
  const listed = [...(store.envVarReach.get(v.id) ?? [])]
  const own = (placeId: string) =>
    rows.some((o) =>
      v.projectId === null
        ? o.projectId === placeId && o.workspaceId === null && o.name === v.name
        : o.workspaceId === placeId && o.name === v.name,
    )
  const named = (placeId: string) => {
    const p = v.projectId === null ? store.projects.get(placeId) : store.workspaces.get(placeId)
    return p ? { id: p.id, slug: p.slug, name: p.name } : null
  }
  const everyPlace =
    v.projectId === null
      ? [...store.projects.values()].filter((p) => p.organizationId === v.organizationId)
      : [...store.workspaces.values()].filter((w) => w.projectId === v.projectId)
  return {
    all: v.allPlaces,
    places: listed.filter((id) => !own(id)).flatMap((id) => named(id) ?? []),
    blocked: everyPlace.filter((p) => own(p.id)).map((p) => p.id),
  }
}

function envVarLevel(v: EnvVar): 'organization' | 'project' | 'workspace' {
  if (v.workspaceId) return 'workspace'
  return v.projectId ? 'project' : 'organization'
}

/** Closest level first, as the adapter ranks them. */
function envVarRank(v: EnvVar): number {
  return v.workspaceId ? 0 : v.projectId ? 1 : 2
}

/** What a unique index raises, as better-sqlite3 reports it: a name already set at the place, a version number taken. */
function uniqueViolation(index = 'env_vars.name'): Error {
  return Object.assign(new Error(`UNIQUE constraint failed: ${index}`), {
    code: 'SQLITE_CONSTRAINT_UNIQUE',
  })
}

export const TEST_USER_ID = 'test-user-1'
export const TEST_ORG_ID = 'test-org-1'
export const TEST_ORG_SLUG = 'test-org'
export const TEST_PROJECT_ID = 'test-project-1'
export const TEST_PROJECT_SLUG = 'test-project'
export const TEST_WORKSPACE_ID = 'test-workspace-1'

/** The test user's role in the test org; `resetStore` puts it back to owner. */
let testOrgRole = 'owner'
export function setTestOrgRole(role: 'owner' | 'admin' | 'member') {
  testOrgRole = role
}

// The mock knows one org with one person. A plain member reads as a project
// member of every project (what the access migration backfills), so the old
// route tests keep their meaning; the people, invitation and request reads
// are not mocked — their tests run on the sqlite harness (`sqlite-app.ts`).
function testGrantRows() {
  return {
    orgRole: testOrgRole,
    projectGrant: testOrgRole === 'member' ? ('member' as const) : null,
    workspaceGrant: null,
  }
}

function notMocked(name: string): never {
  throw new Error(`${name} is not mocked; use the sqlite harness in sqlite-app.ts`)
}

const TEST_MEMBER = {
  id: TEST_USER_ID,
  name: 'Test',
  email: 'test@example.com',
  image: null,
}

// The org and user tables are better-auth's; the mock knows one of each.
function isTestOrg(ref: { id: string } | { slug: string }): boolean {
  return 'id' in ref ? ref.id === TEST_ORG_ID : ref.slug === TEST_ORG_SLUG
}

function memberOfTestOrg(userId: string): boolean {
  return userId === TEST_USER_ID
}

function workspacesOf(projectId: string): Workspace[] {
  return [...store.workspaces.values()]
    .filter((w) => w.projectId === projectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function workspaceOverview(w: Workspace): WorkspaceOverview {
  const project = store.projects.get(w.projectId)!
  const items = [...store.workflows.values()].filter((x) => x.workspaceId === w.id)
  return {
    ...w,
    counts: {
      workflows: items.filter((x) => x.kind === 'workflow').length,
      deployed: 0,
      functions: items.filter((x) => x.kind === 'script').length,
      sharedOut: items.filter((x) => x.sharedAt !== null).length,
      runs24h: 0,
      failing: 0,
      lastRunAt: null,
    },
    createdByName: w.createdBy ? TEST_MEMBER.name : null,
    lockedByName: null,
    projectName: project.name,
    projectLockedAt: project.lockedAt,
    siblings: workspacesOf(w.projectId).length,
    members: [{ ...TEST_MEMBER, ...testGrantRows(), lastActiveAt: null }],
    viewer: testGrantRows(),
  }
}

function projectOverview(p: Project): ProjectOverview {
  return {
    ...p,
    workspaces: workspacesOf(p.id).map((w) => ({
      id: w.id,
      slug: w.slug,
      name: w.name,
      colour: w.colour,
    })),
    health: { workflows: 0, deployed: 0, failing: 0, lastRunAt: null },
    lockedByName: null,
    lockedWorkspaces: [],
    members: [{ ...TEST_MEMBER, role: testOrgRole }],
    viewer: testGrantRows(),
  }
}

/** Newest first as the adapter orders deployments: created_at, then id. */
function newerFirst(a: Deployment, b: Deployment): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}

/**
 * As the adapter's live-per-account rule (`liveOnItsAccount`): each account's
 * newest successful deploy of the workflow, newest first, then by account id.
 */
function liveByAccount(workflowId: string): Deployment[] {
  const newest = new Map<string, Deployment>()
  for (const d of store.deployments.values()) {
    if (d.workflowId !== workflowId || d.status !== 'success' || !d.connectionId) continue
    const seen = newest.get(d.connectionId)
    if (!seen || newerFirst(d, seen) < 0) newest.set(d.connectionId, d)
  }
  return [...newest.values()].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.connectionId!.localeCompare(b.connectionId!),
  )
}

/** The active runs' sync rows, picked as the SQL picks them. */
function syncEntries(): ActiveRunForSync[] {
  const terminal = new Set(['complete', 'errored', 'terminated'])
  return [...store.runs.values()]
    .filter((r) => !terminal.has(r.status))
    .map((run) => {
      // As the SQL picks it: this version's deploys that went out, the run's own account
      // first, newest first.
      const deployment = [...store.deployments.values()]
        .filter(
          (d) =>
            d.workflowId === run.workflowId &&
            d.versionId === run.versionId &&
            (d.status === 'success' || d.status === 'taken_down'),
        )
        .sort((a, b) => {
          const own =
            Number(b.connectionId === run.connectionId) -
            Number(a.connectionId === run.connectionId)
          return own !== 0 ? own : a.createdAt < b.createdAt ? 1 : -1
        })[0]
      return {
        run,
        workflowName: store.workflows.get(run.workflowId)?.name ?? '',
        deployedName: run.deployedName ?? deployment?.deployedName ?? null,
        configSnapshot: deployment?.configSnapshot ?? null,
        place: syncPlace(run.workflowId),
      }
    })
}

/** One run's sync row, whether or not it has ended. */
function syncEntry(runId: string, workflowId: string): ActiveRunForSync | null {
  const run = store.runs.get(runId)
  if (!run || run.workflowId !== workflowId) return null
  const [entry] = syncEntries().filter((e) => e.run.id === runId)
  return (
    entry ?? {
      run,
      workflowName: store.workflows.get(run.workflowId)?.name ?? '',
      // A run that ended keeps its own name, as the SQL reads it for any run.
      deployedName: run.deployedName ?? null,
      configSnapshot: null,
      place: syncPlace(run.workflowId),
    }
  )
}

/** A run as the store holds it, for tests to look at after a call. */
export function storedRun(id: string): WorkflowRun | null {
  return store.runs.get(id) ?? null
}

/** The account the workflow's newest successful deploy went out on, as the real query picks it. */
function newestLiveAccount(workflowId: string): string | null {
  return (
    [...store.deployments.values()]
      .filter((d) => d.workflowId === workflowId && d.status === 'success' && d.connectionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1)?.connectionId ?? null
  )
}

const mockDb: DatabaseAdapter = {
  // Membership
  async isOrgMember(userId, organizationId) {
    return memberOfTestOrg(userId) && organizationId === TEST_ORG_ID
  },
  async getOrganizationIfMember(userId, ref) {
    if (!memberOfTestOrg(userId) || !isTestOrg(ref)) return null
    return { id: TEST_ORG_ID, slug: TEST_ORG_SLUG, name: 'Test Org', role: testOrgRole }
  },
  async getProjectIfMember(userId, ref, workspace) {
    const project =
      'id' in ref
        ? store.projects.get(ref.id)
        : ref.org === TEST_ORG_SLUG
          ? [...store.projects.values()].find((p) => p.slug === ref.slug)
          : undefined
    if (!project) return null
    if (!memberOfTestOrg(userId) || project.organizationId !== TEST_ORG_ID) return null
    let chip: WorkspaceChip | null = null
    if (workspace) {
      const found = workspacesOf(project.id).find((w) =>
        'id' in workspace ? w.id === workspace.id : w.slug === workspace.slug,
      )
      if (!found) return null
      chip = { id: found.id, slug: found.slug, name: found.name, colour: found.colour }
    }
    return { project, workspace: chip, ...testGrantRows() }
  },
  async getWorkspaceIfMember(userId, ref) {
    if (!memberOfTestOrg(userId)) return null
    const w =
      'id' in ref
        ? store.workspaces.get(ref.id)
        : [...store.workspaces.values()].find(
            (x) =>
              ref.org === TEST_ORG_SLUG &&
              store.projects.get(x.projectId)?.slug === ref.project &&
              x.slug === ref.workspace,
          )
    if (!w) return null
    const project = store.projects.get(w.projectId)
    if (!project || project.organizationId !== TEST_ORG_ID) return null
    return {
      workspaceId: w.id,
      projectId: w.projectId,
      organizationId: project.organizationId,
      workspaceName: w.name,
      projectName: project.name,
      ...testGrantRows(),
    }
  },
  async getWorkflowForUser(userId, workflowId) {
    const workflow = store.workflows.get(workflowId)
    if (!workflow || !memberOfTestOrg(userId)) return null
    const project = store.projects.get(workflow.projectId)
    if (!project || project.organizationId !== TEST_ORG_ID) return null
    return { workflow, organizationId: project.organizationId, ...testGrantRows() }
  },
  async getWorkspaceInProject(projectId, ref) {
    const w = workspacesOf(projectId).find((x) =>
      'id' in ref ? x.id === ref.id : x.slug === ref.slug,
    )
    if (!w) return null
    return {
      workspaceId: w.id,
      projectId,
      organizationId: store.projects.get(projectId)!.organizationId,
    }
  },
  async listOrganizationsForMember(userId) {
    if (!memberOfTestOrg(userId)) return []
    return [
      {
        id: TEST_ORG_ID,
        slug: TEST_ORG_SLUG,
        name: 'Test Org',
        logo: null,
        createdAt: now(),
        viewerRole: testOrgRole,
        projectCount: store.projects.size,
        memberCount: 1,
        grants: { projects: [], workspaces: [] },
        health: { failing: 0, lastRunAt: null },
      },
    ]
  },
  async getScopeBySlugs(userId, slugs) {
    if (!memberOfTestOrg(userId) || slugs.org !== TEST_ORG_SLUG) return null
    const org = {
      id: TEST_ORG_ID,
      slug: TEST_ORG_SLUG,
      name: 'Test Org',
      logo: null,
      createdAt: now(),
      viewerRole: testOrgRole,
      projectCount: store.projects.size,
      memberCount: 1,
      members: [{ ...TEST_MEMBER, role: testOrgRole }],
    }
    const project =
      slugs.project === undefined
        ? null
        : ([...store.projects.values()].find((p) => p.slug === slugs.project) ?? null)
    const workspace =
      project && slugs.workspace !== undefined
        ? (workspacesOf(project.id).find((w) => w.slug === slugs.workspace) ?? null)
        : null
    return {
      org,
      project: project && projectOverview(project),
      workspace: workspace && {
        ...workspaceOverview(workspace),
        runsByHour: Array.from({ length: 24 }, (_, i) =>
          i === 23 ? { runs: 2, complete: 1, failed: 1 } : { runs: 0, complete: 0, failed: 0 },
        ),
      },
    }
  },

  // Projects
  async createProject(data) {
    const p: Project = {
      id: data.id,
      organizationId: data.organizationId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      lockedBy: null,
      lockedAt: null,
      createdAt: now(),
      updatedAt: now(),
    }
    const w: Workspace = {
      id: data.defaultWorkspaceId,
      projectId: p.id,
      name: 'Default',
      slug: 'default',
      description: null,
      colour: 'green',
      createdBy: data.createdBy ?? null,
      lockedBy: null,
      lockedAt: null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.projects.set(p.id, p)
    store.workspaces.set(w.id, w)
    return { project: p, workspace: w }
  },
  async getProjectById(id) {
    return store.projects.get(id) ?? null
  },
  async countProjectsInOrganization(organizationId) {
    return [...store.projects.values()].filter((p) => p.organizationId === organizationId).length
  },
  async listProjectsByOrganization(organizationId, _userId) {
    return {
      data: [...store.projects.values()]
        .filter((p) => p.organizationId === organizationId)
        .map(projectOverview),
      nextCursor: null,
    }
  },

  async moveProjectToOrganization() {
    return notMocked('moveProjectToOrganization')
  },
  // Lock writes are the SQL's: their tests run on the real database (sqlite-app.ts).
  async getProjectLocks(id, organizationId) {
    const p = store.projects.get(id)
    if (!p || p.organizationId !== organizationId) return null
    const locked = workspacesOf(id).filter((w) => w.lockedAt !== null)
    return { ownLock: p.lockedAt !== null, lockedWorkspaces: locked.map((w) => w.name) }
  },
  async setProjectLock() {
    return notMocked('setProjectLock')
  },
  async getWorkspaceLocks(id) {
    const w = store.workspaces.get(id)
    const project = w && store.projects.get(w.projectId)
    if (!w || !project) return null
    return {
      ownLock: w.lockedAt !== null,
      lockedByProject: project.lockedAt !== null ? project.name : null,
      isLastWorkspace: workspacesOf(w.projectId).length === 1,
    }
  },
  async setWorkspaceLock() {
    return notMocked('setWorkspaceLock')
  },

  // Workspaces
  async listWorkspacesByProject(projectId, _userId) {
    return workspacesOf(projectId).map(workspaceOverview)
  },
  async createWorkspace(data, _members) {
    if (workspacesOf(data.projectId).some((w) => w.slug === data.slug)) return null
    const w: Workspace = {
      id: data.id,
      projectId: data.projectId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      colour: data.colour ?? 'green',
      createdBy: data.createdBy ?? null,
      lockedBy: null,
      lockedAt: null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.workspaces.set(w.id, w)
    return w
  },
  async getWorkspaceById(id) {
    return store.workspaces.get(id) ?? null
  },
  async updateWorkspace(id, data) {
    const w = store.workspaces.get(id)
    if (!w) return null
    if (
      data.slug !== undefined &&
      workspacesOf(w.projectId).some((x) => x.slug === data.slug && x.id !== id)
    ) {
      return null
    }
    const { slugFromName, ...fields } = data
    const fromName =
      slugFromName !== undefined &&
      data.slug === undefined &&
      w.slug === 'default' &&
      !workspacesOf(w.projectId).some((x) => x.slug === slugFromName && x.id !== id)
        ? { slug: slugFromName }
        : {}
    const updated = { ...w, ...fields, ...fromName, updatedAt: now() }
    store.workspaces.set(id, updated)
    return updated
  },
  async deleteWorkspaceUnlessBlocked(id) {
    const w = store.workspaces.get(id)
    if (!w || workspacesOf(w.projectId).length < 2) return false
    if (w.lockedAt !== null || store.projects.get(w.projectId)?.lockedAt) return false
    store.workspaces.delete(id)
    for (const [wfId, wf] of store.workflows)
      if (wf.workspaceId === id) store.workflows.delete(wfId)
    return true
  },
  async moveWorkflowsToWorkspace(fromWorkspaceId, toWorkspaceId, workflowIds) {
    const from = store.workspaces.get(fromWorkspaceId)
    const to = store.workspaces.get(toWorkspaceId)
    if (!from || !to || from.projectId !== to.projectId) return []
    const moved: { id: string; name: string }[] = []
    for (const id of workflowIds) {
      const wf = store.workflows.get(id)
      if (!wf || wf.workspaceId !== fromWorkspaceId) continue
      store.workflows.set(id, { ...wf, workspaceId: toWorkspaceId, updatedAt: now() })
      moved.push({ id, name: wf.name })
    }
    return moved
  },
  async listWorkspaceRuns(workspaceId, filter) {
    const failed = new Set(['errored', 'terminated'])
    const result = (status: string) =>
      status === 'complete' ? 'succeeded' : failed.has(status) ? 'failed' : 'running'
    const matching: WorkspaceRunRow[] = [...store.runs.values()]
      .filter((r) => store.workflows.get(r.workflowId)?.workspaceId === workspaceId)
      .filter((r) => !filter.since || r.createdAt >= filter.since)
      .filter((r) => !filter.workflowId || r.workflowId === filter.workflowId)
      .map((r) => {
        const wf = store.workflows.get(r.workflowId)!
        return { ...r, workflowName: wf.name, kind: wf.kind }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const counts = {
      all: matching.length,
      succeeded: matching.filter((r) => result(r.status) === 'succeeded').length,
      failed: matching.filter((r) => result(r.status) === 'failed').length,
      running: matching.filter((r) => result(r.status) === 'running').length,
    }
    const data = filter.result
      ? matching.filter((r) => result(r.status) === filter.result)
      : matching
    // Hour buckets come from SQL, which the db package's harness covers.
    const byHour = filter.workflowId
      ? Array.from({ length: 24 }, () => ({ runs: 0, complete: 0, failed: 0 }))
      : undefined
    return { data, nextCursor: null, counts, ...(byHour && { byHour }) }
  },
  async countUnreadNotifications() {
    return 0
  },
  async orgHomeSummary() {
    return { failing: { count: 0, first: null }, activity: [] }
  },
  async projectSummary() {
    return {
      admins: { count: 0, people: [] },
      projectKeys: 0,
      variables: { total: 0, own: 0, inherited: 0, first: [] },
      shared: { count: 0, first: [] },
    }
  },
  async workspacePageOverview() {
    return null
  },
  async workflowPageSummary() {
    return null
  },
  async workspaceSettingsCounts() {
    return { members: 0, keys: 0, variables: 0 }
  },
  async resourceCounts() {
    return { installedNodes: 0, variables: 0 }
  },
  async listFailingWorkflows() {
    return []
  },

  // Access, invitations and requests: the sqlite harness covers these.
  async listOrgMembers() {
    return notMocked('listOrgMembers')
  },
  async getPersonAccess() {
    return notMocked('getPersonAccess')
  },
  async checkInOrganization() {
    return notMocked('checkInOrganization')
  },
  async setOrgRole() {
    return notMocked('setOrgRole')
  },
  async saveAccess() {
    return notMocked('saveAccess')
  },
  async removeOrgMember() {
    return notMocked('removeOrgMember')
  },
  async listWorkspacePeople() {
    return notMocked('listWorkspacePeople')
  },
  async listProjectMembers() {
    return notMocked('listProjectMembers')
  },
  async getGrantRows() {
    return notMocked('getGrantRows')
  },
  async addWorkspaceMember() {
    return notMocked('addWorkspaceMember')
  },
  async addProjectMember() {
    return notMocked('addProjectMember')
  },
  async addWorkspaceGrants() {
    return notMocked('addWorkspaceGrants')
  },
  async projectGrantRows() {
    return notMocked('projectGrantRows')
  },
  async setWorkspaceGrant() {
    return notMocked('setWorkspaceGrant')
  },
  async removeWorkspaceGrant() {
    return notMocked('removeWorkspaceGrant')
  },
  async getOrgRole() {
    return notMocked('getOrgRole')
  },
  async invitationChecks() {
    return notMocked('invitationChecks')
  },
  async createInvitations() {
    return notMocked('createInvitations')
  },
  async listInvitations() {
    return notMocked('listInvitations')
  },
  async getInvitation() {
    return notMocked('getInvitation')
  },
  async acceptInvitation() {
    return notMocked('acceptInvitation')
  },
  async setInvitationStatus() {
    return notMocked('setInvitationStatus')
  },
  async cancelInvitation() {
    return notMocked('cancelInvitation')
  },
  async resendInvitation() {
    return notMocked('resendInvitation')
  },
  async askForNewInvitation() {
    return notMocked('askForNewInvitation')
  },
  async listInvitationsForEmail() {
    return notMocked('listInvitationsForEmail')
  },
  async getOwnAccessRequest() {
    return notMocked('getOwnAccessRequest')
  },
  async createAccessRequest() {
    return notMocked('createAccessRequest')
  },
  async getAccessRequestForDecision() {
    return notMocked('getAccessRequestForDecision')
  },
  async decideAccessRequest() {
    return notMocked('decideAccessRequest')
  },
  async updateProject(id, organizationId, data) {
    const p = store.projects.get(id)
    if (!p || p.organizationId !== organizationId) return null
    const updated = { ...p, ...data, updatedAt: now() }
    store.projects.set(id, updated)
    return updated
  },
  async deleteProject(id, organizationId) {
    const p = store.projects.get(id)
    if (!p || p.organizationId !== organizationId) return false
    if (p.lockedAt !== null || workspacesOf(id).some((w) => w.lockedAt !== null)) return false
    return store.projects.delete(id)
  },

  // Workflows
  async createWorkflow(data) {
    const candidates = workspacesOf(data.projectId)
    const workspace = data.workspaceId
      ? candidates.find((w) => w.id === data.workspaceId)
      : candidates[0]
    if (!workspace) return null
    const wf: Workflow = {
      ...data,
      workspaceId: workspace.id,
      description: data.description ?? null,
      kind: data.kind ?? 'workflow',
      currentVersionId: null,
      envVars: null,
      triggerCode: null,
      dependencies: null,
      deployConfig: null,
      sharedBy: null,
      sharedAt: null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.workflows.set(wf.id, wf)
    return wf
  },
  async getWorkflowById(id) {
    return store.workflows.get(id) ?? null
  },
  async listWorkflowsByProject(projectId) {
    return {
      data: [...store.workflows.values()].filter((w) => w.projectId === projectId),
      nextCursor: null,
    }
  },
  async listWorkflowsWithStatus(projectId, _pagination, filter) {
    return {
      data: [...store.workflows.values()]
        .filter((w) => w.projectId === projectId)
        .filter((w) => !filter?.workspaceId || w.workspaceId === filter.workspaceId)
        .filter((w) => !filter?.kind || w.kind === filter.kind)
        .map((w) => ({
          ...w,
          deployStatus: null,
          deployVersionId: null,
          deployedVersion: null,
          sharedByName: null,
          lastRunStatus: null,
          lastRunAt: null,
          recentRunStatuses: [],
        })),
      nextCursor: null,
    }
  },
  async updateWorkflow(id, data) {
    const wf = store.workflows.get(id)
    if (!wf) throw new Error('Not found')
    const updated = { ...wf, ...data, updatedAt: now() }
    store.workflows.set(id, updated)
    return updated
  },
  async deleteWorkflow(id) {
    store.workflows.delete(id)
  },
  async moveWorkflowToProject(id, targetProjectId) {
    const wf = store.workflows.get(id)
    const home = workspacesOf(targetProjectId)[0]
    if (!wf || !home) return null
    const moved = {
      ...wf,
      projectId: targetProjectId,
      workspaceId: home.id,
      sharedBy: null,
      sharedAt: null,
      updatedAt: now(),
    }
    store.workflows.set(id, moved)
    return moved
  },
  // The audit log runs through the real database in audit.test.ts; the fake
  // keeps what was written so a route test can look.
  async insertAuditEvents(rows) {
    store.auditEvents.push(...rows)
  },
  async insertPersonAuditEvents(entry) {
    store.personAuditEvents.push(entry)
  },
  // Your account (B10) runs through the real database in packages/db; a
  // route test spies on the read it needs.
  async getAccount() {
    return notMocked('getAccount')
  },
  async soleOwnedOrgNames() {
    return []
  },
  async listAccountSessions() {
    return notMocked('listAccountSessions')
  },
  async revokeAccountSession() {
    return notMocked('revokeAccountSession')
  },
  async revokeOtherAccountSessions() {
    return notMocked('revokeOtherAccountSessions')
  },
  async exportAccount() {
    return notMocked('exportAccount')
  },
  async listAuditEvents() {
    return notMocked('listAuditEvents')
  },
  // The lockout itself runs through the real database (audit.test.ts); here
  // every check is the caller's first.
  async reserveAuditAttempt() {
    return { failures: 0, lastFailureAt: null }
  },
  async deleteAuditEvent() {},
  async purgeAuditEvents() {
    return 0
  },
  // The Inbox runs through the real database (notifications.test.ts); the
  // fake keeps what was sent so a route test can look.
  async notify(entry) {
    store.notifications.push(entry)
    return []
  },
  async clearNotifications() {},
  async clearNotificationsByPrefix() {},
  async notifyExpiringKeys() {
    return 0
  },
  async listNotifications() {
    return notMocked('listNotifications')
  },
  async markNotificationRead() {
    return notMocked('markNotificationRead')
  },
  async markAllNotificationsRead() {
    return notMocked('markAllNotificationsRead')
  },
  async purgeNotifications() {
    return 0
  },
  async getReleaseVisit() {
    return notMocked('getReleaseVisit')
  },
  async setReleaseVisit() {
    return notMocked('setReleaseVisit')
  },
  async getProjectMoveOutcome() {
    return notMocked('getProjectMoveOutcome')
  },
  // Sharing runs through the real database in sharing.test.ts; these keep the fake whole.
  async setWorkflowShared(id, workspaceId, userId, shared) {
    const wf = store.workflows.get(id)
    if (!wf || wf.workspaceId !== workspaceId) return null
    const sharedAt = shared ? (wf.sharedAt ?? now()) : null
    const sharedBy = shared ? (wf.sharedBy ?? userId) : null
    store.workflows.set(id, { ...wf, sharedBy, sharedAt })
    return { sharedBy, sharedAt, sharedByName: null, changed: (wf.sharedAt === null) === shared }
  },
  async listSharedWorkflows() {
    return { data: [], nextCursor: null }
  },

  // Versions
  async createVersion(data) {
    const existing = [...store.versions.values()].filter((v) => v.workflowId === data.workflowId)
    const maxExisting = Math.max(0, ...existing.map((v) => v.version))
    const assigned = data.version ?? maxExisting + 1
    // The (workflow_id, version) unique index: an explicit number that is
    // taken is the lost race the save route reads it as.
    if (existing.some((v) => v.version === assigned)) {
      throw uniqueViolation('workflow_versions.workflow_id, workflow_versions.version')
    }
    const v: WorkflowVersion = {
      // The dead source columns, as a real row comes back from the adapter —
      // mirrored here, not configurable, because `CreateVersionData` no
      // longer carries them. Both copies go in the Phase 2 cleanup.
      sourceMode: 'generated',
      source: null,
      manifest: null,
      baseGeneratedHash: null,
      ...data,
      createdBy: data.createdBy ?? null,
      version: assigned,
      locked: 0,
      createdAt: now(),
    }
    store.versions.set(v.id, v)
    return v
  },
  async getWorkflowVersionById(id) {
    return store.versions.get(id) ?? null
  },
  async getNextVersionNumber(workflowId) {
    const versions = [...store.versions.values()].filter((v) => v.workflowId === workflowId)
    return versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1
  },
  async getLatestVersion(workflowId) {
    return (
      [...store.versions.values()]
        .filter((v) => v.workflowId === workflowId)
        .sort((a, b) => b.version - a.version)[0] ?? null
    )
  },
  async updateLatestVersionIfIrMatches(latest, expectedIr, patch) {
    const v = store.versions.get(latest.id)
    if (!v || v.ir !== expectedIr) return null
    const newer = [...store.versions.values()].some(
      (o) => o.workflowId === latest.workflowId && o.version > latest.version,
    )
    if (newer) return null
    const saved = { ...v, ...patch }
    store.versions.set(latest.id, saved)
    return saved
  },
  async advanceCurrentVersion(workflowId, version) {
    const wf = store.workflows.get(workflowId)
    if (!wf) return false
    const current = wf.currentVersionId ? store.versions.get(wf.currentVersionId) : undefined
    if (current && current.version >= version.version) return false
    store.workflows.set(workflowId, { ...wf, currentVersionId: version.id, updatedAt: now() })
    return true
  },
  async listVersionsByWorkflow(workflowId) {
    return {
      data: [...store.versions.values()]
        .filter((v) => v.workflowId === workflowId)
        // As the adapter lists: newest save first, not highest number — so a
        // route that confuses the two cannot pass here.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        // Names come from a join on users, which the sqlite harness covers.
        .map((v) => ({ ...v, createdByName: null })),
      nextCursor: null,
    }
  },
  async updateVersion(id, data) {
    const v = store.versions.get(id)
    if (!v) throw new Error('Not found')
    store.versions.set(id, { ...v, ...data })
  },
  async getVersionDeleteCheck(versionId, workflowId) {
    const version = store.versions.get(versionId)
    if (!version || version.workflowId !== workflowId) return null
    return {
      version: version.version,
      locked: version.locked === 1,
      newerVersions: [...store.versions.values()].filter(
        (v) => v.workflowId === workflowId && v.version > version.version,
      ).length,
      isCurrent: store.workflows.get(workflowId)?.currentVersionId === versionId,
      isLive: liveByAccount(workflowId).some((d) => d.versionId === versionId),
    }
  },
  async getLatestVersionForSave(workflowId) {
    const latest = [...store.versions.values()]
      .filter((v) => v.workflowId === workflowId)
      .sort((a, b) => b.version - a.version)[0]
    if (!latest) return null
    return {
      version: latest,
      everDeployed: [...store.deployments.values()].some(
        (d) =>
          d.workflowId === workflowId &&
          d.versionId === latest.id &&
          (d.status === 'success' || d.status === 'taken_down'),
      ),
    }
  },
  async deleteVersion(id) {
    store.versions.delete(id)
    // The real foreign keys set null: the rows keep their number.
    for (const d of store.deployments.values()) if (d.versionId === id) d.versionId = null
    for (const r of store.runs.values()) if (r.versionId === id) r.versionId = null
  },

  // Connections — coverage, the dashboard list and token checks run through
  // the real database (connections-api.test.ts); these keep the fake whole.
  async createConnection(data) {
    const { projectIds: _projectIds, token, visibleTo: _visibleTo, ...row } = data
    const c: Connection = {
      ...row,
      projectId: null,
      allProjects: data.allProjects ?? true,
      tokenStatus: token?.status ?? 'unchecked',
      tokenExpiresAt: token?.expiresAt ?? null,
      tokenCheckedAt: token?.checkedAt ?? null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.connections.set(c.id, c)
    return listedConnection(c)
  },
  async getProviderConnectionById(id) {
    return store.connections.get(id) ?? null
  },
  async getConnectionDeployedWith(named, organizationId, workflowId) {
    const id = named ?? newestLiveAccount(workflowId)
    const connection = id ? store.connections.get(id) : undefined
    if (!id || !connection || connection.organizationId !== organizationId) return null
    const deployed = [...store.deployments.values()].filter(
      (d) => d.workflowId === workflowId && d.connectionId === id && d.status === 'success',
    )
    // Newest last; equal timestamps keep insertion order.
    const newest = deployed.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
    return newest
      ? {
          ...connection,
          deployedVersionId: newest.versionId,
          deployedVersionNumber: newest.versionNumber,
          deployedName: newest.deployedName ?? null,
          deploymentConfig: store.deploymentConfigs.get(`${workflowId}|${id}`)?.config ?? null,
        }
      : null
  },
  async getConnectionForProject(id, organizationId) {
    const connection = store.connections.get(id)
    if (!connection || connection.organizationId !== organizationId) return null
    return { connection, covered: true }
  },
  async getLiveService(named, organizationId, workflowId) {
    const id = named ?? newestLiveAccount(workflowId)
    const connection = id ? store.connections.get(id) : undefined
    if (!id || !connection || connection.organizationId !== organizationId) return null
    const newest = [...store.deployments.values()]
      .filter((d) => d.workflowId === workflowId && d.connectionId === id && d.status === 'success')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1)
    return newest
      ? {
          connectionId: id,
          provider: connection.provider,
          serviceUrl: newest.serviceUrl ?? null,
          versionId: newest.versionId,
          versionNumber: newest.versionNumber,
        }
      : null
  },
  async getDeployConfigFor(id, organizationId, _projectId, workflowId) {
    const connection = store.connections.get(id)
    if (!connection || connection.organizationId !== organizationId) return null
    const stored = store.deploymentConfigs.get(`${workflowId}|${id}`)
    return { provider: connection.provider, covered: true, config: stored?.config ?? null }
  },
  async listConnectionsByOrganization(organizationId) {
    return {
      data: [...store.connections.values()].filter((c) => c.organizationId === organizationId),
      nextCursor: null,
    }
  },
  async listConnections(organizationId) {
    return {
      data: [...store.connections.values()]
        .filter((c) => c.organizationId === organizationId)
        .map(listedConnection),
      nextCursor: null,
    }
  },
  async updateConnection(id, data) {
    const c = store.connections.get(id)
    if (!c || c.organizationId !== data.organizationId) return null
    const {
      projectIds: _projectIds,
      organizationId: _organizationId,
      visibleTo: _visibleTo,
      expectedUpdatedAt: _expectedUpdatedAt,
      token,
      ...rest
    } = data
    const updated = {
      ...c,
      ...rest,
      ...(token && {
        tokenStatus: token.status,
        tokenExpiresAt: token.expiresAt,
        tokenCheckedAt: token.checkedAt,
      }),
      updatedAt: now(),
    }
    store.connections.set(id, updated)
    return listedConnection(updated)
  },
  async connectionsDueForTokenCheck() {
    return []
  },
  async recordConnectionTokenCheck() {
    return notMocked('recordConnectionTokenCheck')
  },
  async notifyExpiringConnections() {
    return 0
  },
  async getProjectSetup() {
    return notMocked('getProjectSetup')
  },
  async deleteConnection(id) {
    return store.connections.delete(id)
  },
  // A project's accounts run through the real database (project-connections.test.ts).
  async getProjectOwnedConnection() {
    return notMocked('getProjectOwnedConnection')
  },
  async listProjectConnections() {
    return notMocked('listProjectConnections')
  },
  async listAvailableProjectConnections() {
    return notMocked('listAvailableProjectConnections')
  },
  async addProjectConnections() {
    return notMocked('addProjectConnections')
  },
  async createProjectConnection() {
    return notMocked('createProjectConnection')
  },
  async setProjectDefaultConnection() {
    return notMocked('setProjectDefaultConnection')
  },
  async setWorkspaceConnection() {
    return notMocked('setWorkspaceConnection')
  },
  async removeProjectConnection() {
    return notMocked('removeProjectConnection')
  },
  async listLiveDeployments(workflowId) {
    const workflow = store.workflows.get(workflowId)
    const organizationId = workflow ? store.projects.get(workflow.projectId)?.organizationId : null
    return liveByAccount(workflowId).flatMap((d) => {
      const connection = d.connectionId ? store.connections.get(d.connectionId) : undefined
      if (!connection || connection.organizationId !== organizationId) return []
      const v = d.versionId ? store.versions.get(d.versionId) : undefined
      return [
        {
          id: connection.id,
          name: connection.name,
          deploymentId: d.id,
          serviceUrl: d.serviceUrl,
          provider: connection.provider,
          versionId: d.versionId,
          version: v?.version ?? d.versionNumber,
          versionLocked: v?.locked === 1,
          deployedAt: d.createdAt,
          deployedByName: null,
        },
      ]
    })
  },
  async listDeployTargets() {
    return []
  },

  // Runs
  async createRun(data) {
    const r: WorkflowRun = {
      ...data,
      deployedName: data.deployedName ?? null,
      trigger: data.trigger ?? null,
      params: data.params ?? null,
      contentType: data.contentType ?? null,
      responseStatus: data.responseStatus ?? null,
      durationMs: data.durationMs ?? null,
      output: data.output ?? null,
      error: data.error ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? data.createdAt ?? now(),
    }
    store.runs.set(r.id, r)
    return r
  },
  async listActiveRunsForSyncWithAccounts() {
    return syncEntries().map((entry) => {
      const connection = entry.run.connectionId
        ? store.connections.get(entry.run.connectionId)
        : undefined
      const owner = store.workflows.get(entry.run.workflowId)
      const sameOrg =
        connection &&
        (!owner?.projectId ||
          connection.organizationId ===
            (store.projects.get(owner.projectId)?.organizationId ?? connection.organizationId))
      return { entry, connection: sameOrg ? connection! : null }
    })
  },
  async getRunForSyncWithAccount(runId, workflowId, organizationId) {
    const entry = syncEntry(runId, workflowId)
    if (!entry) return null
    const connection = entry.run.connectionId
      ? store.connections.get(entry.run.connectionId)
      : undefined
    return {
      entry,
      connection: connection && connection.organizationId === organizationId ? connection : null,
    }
  },
  async getRunDetail(runId, workflowId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return null
    const { deployedName: _internal, params, ...detail } = run
    return { ...detail, trigger: detail.trigger as RunTrigger | null, hasParams: params !== null }
  },
  async getRunParams(runId, workflowId, connectionId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return null
    if (connectionId !== undefined && run.connectionId !== connectionId) return null
    return { params: run.params, contentType: run.contentType ?? null }
  },
  async getRunControl(runId, workflowId, organizationId) {
    const entry = syncEntry(runId, workflowId)
    if (!entry) return null
    const { run } = entry
    const connection = run.connectionId ? store.connections.get(run.connectionId) : undefined
    return {
      runId: run.id,
      status: run.status,
      instanceId: run.instanceId,
      connectionId: run.connectionId,
      deployedName: entry.deployedName ?? null,
      connection: connection && connection.organizationId === organizationId ? connection : null,
    }
  },
  async listRunsByWorkflow(workflowId) {
    return {
      data: [...store.runs.values()].filter((r) => r.workflowId === workflowId),
      nextCursor: null,
    }
  },
  async updateRun(id, data) {
    const r = store.runs.get(id)
    if (!r) throw new Error('Not found')
    const updated = { ...r, ...data, updatedAt: now() }
    store.runs.set(id, updated)
    return updated
  },
  async updateRunFromStatus(id, fromStatus, data) {
    const r = store.runs.get(id)
    if (!r || r.status !== fromStatus) return false
    store.runs.set(id, { ...r, ...data, updatedAt: data.updatedAt ?? now() })
    return true
  },
  async listRecentRunsByProject(projectId) {
    const wfIds = new Set(
      [...store.workflows.values()].filter((w) => w.projectId === projectId).map((w) => w.id),
    )
    return {
      data: [...store.runs.values()].filter((r) => wfIds.has(r.workflowId)),
      nextCursor: null,
    }
  },
  // Run steps
  async upsertRunSteps(runId, steps) {
    for (const s of steps) {
      const key = `${runId}|${s.stepName}|${s.kind}|${s.stepIndex}`
      const existing = store.runSteps.get(key)
      store.runSteps.set(key, {
        id: existing?.id ?? s.id,
        runId,
        nodeId: s.nodeId ?? null,
        stepName: s.stepName,
        kind: s.kind,
        stepIndex: s.stepIndex,
        status: s.status,
        attemptCount: s.attemptCount,
        error: s.error ?? null,
        startedAt: s.startedAt ?? null,
        endedAt: s.endedAt ?? null,
        output: s.output ?? null,
        outputTruncated: s.outputTruncated ? 1 : 0,
        attempts: s.attempts ?? null,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      })
    }
  },
  async getRunStepExtras(stepId, runId, workflowId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return null
    const step = [...store.runSteps.values()].find((s) => s.id === stepId && s.runId === runId)
    if (!step) return null
    return {
      output: step.output,
      outputTruncated: step.outputTruncated === 1,
      attempts: step.attempts,
    }
  },
  async listRunSteps(runId, workflowId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return { steps: [], configSnapshot: null }
    const deployment = [...store.deployments.values()]
      .filter(
        (d) =>
          d.workflowId === run.workflowId &&
          d.versionId === run.versionId &&
          d.status === 'success',
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
    const steps = [...store.runSteps.values()]
      .filter((s) => s.runId === runId)
      .map(({ output: _o, outputTruncated: _t, attempts: _a, ...row }) => row)
    return {
      steps,
      // The adapter's scalar subquery rides on step rows: no rows, no snapshot.
      configSnapshot: steps.length > 0 ? (deployment?.configSnapshot ?? null) : null,
    }
  },

  // Project files
  async listWorkflowFiles(workflowId) {
    return [...store.files.values()]
      .filter((f) => f.workflowId === workflowId)
      .sort((a, b) => (a.path < b.path ? -1 : 1))
  },
  async listWorkflowFileSummaries(workflowId) {
    return (await this.listWorkflowFiles(workflowId)).map(({ source: _source, ...rest }) => rest)
  },
  async getWorkflowFile(workflowId, path) {
    return store.files.get(`${workflowId}|${path}`) ?? null
  },
  async upsertWorkflowFile(data) {
    const [row] = await this.upsertWorkflowFiles([data])
    return row!
  },
  async upsertWorkflowFiles(rows) {
    return rows.map((data) => {
      const key = `${data.workflowId}|${data.path}`
      const existing = store.files.get(key)
      const row: WorkflowFile = {
        id: existing?.id ?? data.id,
        workflowId: data.workflowId,
        path: data.path,
        source: data.source,
        hash: data.hash,
        size: data.size,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      }
      store.files.set(key, row)
      return row
    })
  },
  async createWorkflowFile(data) {
    const key = `${data.workflowId}|${data.path}`
    if (store.files.has(key)) return null
    const [row] = await this.upsertWorkflowFiles([data])
    return row!
  },
  async createWorkflowFilesIfAbsent(rows) {
    const absent = rows.filter((data) => !store.files.has(`${data.workflowId}|${data.path}`))
    return this.upsertWorkflowFiles(absent)
  },
  async updateWorkflowFileIfMatches(data, expectedHash) {
    const key = `${data.workflowId}|${data.path}`
    const existing = store.files.get(key)
    if (!existing) return null
    if (expectedHash !== '*' && existing.hash !== expectedHash) return null
    const row: WorkflowFile = {
      ...existing,
      source: data.source,
      hash: data.hash,
      size: data.size,
      updatedAt: now(),
    }
    store.files.set(key, row)
    return row
  },
  async replaceWorkflowFiles(workflowId, rows) {
    for (const [key, file] of store.files) {
      if (file.workflowId === workflowId) store.files.delete(key)
    }
    return this.upsertWorkflowFiles(rows)
  },
  async deleteWorkflowFile(workflowId, path, expectedHash) {
    const key = `${workflowId}|${path}`
    const existing = store.files.get(key)
    if (!existing) return false
    if (expectedHash !== undefined && existing.hash !== expectedHash) return false
    return store.files.delete(key)
  },

  // Test sessions — the caps the real adapter enforces inside its INSERT are
  // applied here in the same order, so route tests see the same refusals.
  async reserveTestSession(data, limits) {
    const unfinished = [...store.testSessions.values()].filter(isUnfinishedSession)
    const held = unfinished.filter((s) => s.userId === data.userId)
    if (held.length >= limits.maxConcurrentPerUser) return null
    if (unfinished.length >= limits.maxConcurrentTotal) return null
    const inProject = [...store.testSessions.values()].filter(
      (s) => sessionProject(s) === limits.projectId && s.createdAt >= limits.quotaWindowStart,
    )
    if (inProject.length >= limits.maxPerWindowPerProject) return null

    // What the partial unique index enforces: one unfinished row per
    // (user, slot). Without it a route test can never reach the race path.
    const slot = Math.max(-1, ...held.map((s) => s.slot)) + 1
    if (held.some((s) => s.slot === slot)) return null

    const session: TestSession = {
      id: data.id,
      workflowId: data.workflowId,
      slot,
      versionId: data.versionId ?? null,
      userId: data.userId,
      runtime: data.runtime,
      containerId: data.containerId,
      processId: null,
      port: null,
      status: 'starting',
      error: null,
      createdAt: now(),
      lastUsedAt: now(),
      stoppedAt: null,
      files: data.files ? JSON.stringify(data.files) : null,
    }
    store.testSessions.set(session.id, session)
    return session
  },
  async activateTestSession(id, userId, processId, port, cutoffs) {
    const session = store.testSessions.get(id)
    if (!session || session.userId !== userId) return null
    if (session.status !== 'starting' || session.createdAt <= cutoffs.starting) return null
    const activated: TestSession = {
      ...session,
      processId,
      port,
      status: 'running',
      lastUsedAt: now(),
    }
    store.testSessions.set(id, activated)
    return activated
  },
  async getOwnedTestSession(id, userId, projectId, cutoffs, workspaceId) {
    const session = store.testSessions.get(id)
    if (!session || session.userId !== userId) return null
    const workflow = session.workflowId ? store.workflows.get(session.workflowId) : undefined
    if (!workflow || workflow.projectId !== projectId) return null
    if (workspaceId && workflow.workspaceId !== workspaceId) return null
    return { session, workflow, expiry: sessionExpiry(session, cutoffs) }
  },
  async getLiveTestSessionForWorkflow(workflowId, userId, cutoffs) {
    return (
      [...store.testSessions.values()]
        .filter(
          (s) => s.workflowId === workflowId && s.userId === userId && isLiveSession(s, cutoffs),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    )
  },
  async getTestSessionUsage(projectId, userId, quotaWindowStart) {
    const sessions = [...store.testSessions.values()]
    return {
      activeForUser: sessions.filter((s) => s.userId === userId && isUnfinishedSession(s)).length,
      activeEverywhere: sessions.filter(isUnfinishedSession).length,
      createdInWindow: sessions.filter(
        (s) => sessionProject(s) === projectId && s.createdAt >= quotaWindowStart,
      ).length,
    }
  },
  async touchTestSession(id, userId, cutoffs) {
    const session = store.testSessions.get(id)
    if (!session || session.userId !== userId) return false
    if (session.status !== 'running' || !isLiveSession(session, cutoffs)) return false
    store.testSessions.set(id, { ...session, lastUsedAt: now() })
    return true
  },
  async markTestSessionStopped(id, status, options) {
    const session = store.testSessions.get(id)
    if (!session || (session.status !== 'running' && session.status !== 'starting')) return false
    if (options?.userId && session.userId !== options.userId) return false
    store.testSessions.set(id, {
      ...session,
      status,
      error: options?.error ?? null,
      stoppedAt: now(),
    })
    return true
  },
  async listExpiredTestSessions(cutoffs, limit, userId) {
    return [...store.testSessions.values()]
      .filter((s) => isUnfinishedSession(s) && sessionExpiry(s, cutoffs) !== null)
      .filter((s) => userId === undefined || s.userId === userId)
      .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
      .slice(0, limit)
      .map((session) => ({ session, expiry: sessionExpiry(session, cutoffs) }))
  },

  async listUnfinishedTestSessionsForWorkflow(workflowId) {
    return [...store.testSessions.values()]
      .filter((s) => s.workflowId === workflowId && isUnfinishedSession(s))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
  async markTestSessionRuntimeAbandoned(runtime, error) {
    const abandoned = [...store.testSessions.values()].filter(
      (s) => s.runtime === runtime && isUnfinishedSession(s),
    )
    for (const session of abandoned) {
      store.testSessions.set(session.id, {
        ...session,
        status: 'failed',
        error,
        stoppedAt: now(),
      })
    }
    return abandoned
  },

  // Deployment configs (one per workflow + connection)
  async getDeploymentConfig(workflowId, connectionId) {
    return store.deploymentConfigs.get(`${workflowId}|${connectionId}`) ?? null
  },
  async upsertDeploymentConfig(data) {
    const key = `${data.workflowId}|${data.connectionId}`
    const existing = store.deploymentConfigs.get(key)
    const row = {
      id: existing?.id ?? data.id,
      workflowId: data.workflowId,
      connectionId: data.connectionId,
      provider: data.provider,
      config: data.config,
      updatedBy: data.updatedBy ?? null,
      updatedAt: now(),
    } satisfies DeploymentConfig
    store.deploymentConfigs.set(key, row)
    return row
  },
  async listDeploymentConfigsByWorkflow(workflowId) {
    return [...store.deploymentConfigs.values()].filter((c) => c.workflowId === workflowId)
  },
  async deleteDeploymentConfig(workflowId, connectionId) {
    store.deploymentConfigs.delete(`${workflowId}|${connectionId}`)
  },

  // Deployments
  async createDeployment(data) {
    const d: Deployment = {
      ...data,
      versionId: data.versionId ?? null,
      versionNumber: data.versionNumber ?? null,
      connectionId: data.connectionId ?? null,
      serviceUrl: data.serviceUrl ?? null,
      deployedName: data.deployedName ?? null,
      error: data.error ?? null,
      configSnapshot: data.configSnapshot ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: now(),
      takenDownAt: null,
      takenDownBy: null,
    }
    store.deployments.set(d.id, d)
    return d
  },
  async isLiveVersionLocked(workflowId, connectionId) {
    // As the real query: the account's live row, then its version (gone: unlocked).
    const live = liveByAccount(workflowId).find((d) => d.connectionId === connectionId)
    if (!live?.versionId) return false
    return store.versions.get(live.versionId)?.locked === 1
  },
  async listDeploymentsByWorkflow(workflowId) {
    return {
      data: [...store.deployments.values()]
        .filter((d) => d.workflowId === workflowId)
        .sort(newerFirst)
        .map((d) => {
          const v = d.versionId ? store.versions.get(d.versionId) : undefined
          return {
            ...d,
            connectionName: d.connectionId
              ? (store.connections.get(d.connectionId)?.name ?? null)
              : null,
            createdByName: null,
            version: v?.version ?? d.versionNumber,
            versionLocked: v?.locked ?? null,
          }
        }),
      nextCursor: null,
    }
  },
  async listRecentDeploymentsByProject(projectId, _pagination, _visibleTo, workspaceId) {
    const wfIds = new Set(
      [...store.workflows.values()]
        .filter((w) => w.projectId === projectId && (!workspaceId || w.workspaceId === workspaceId))
        .map((w) => w.id),
    )
    return {
      data: [...store.deployments.values()].filter((d) => wfIds.has(d.workflowId)),
      nextCursor: null,
    }
  },
  async takeDownDeploymentsOnConnection(workflowId, connectionId, before, takenDownBy) {
    for (const d of store.deployments.values()) {
      if (
        d.workflowId === workflowId &&
        d.connectionId === connectionId &&
        d.status === 'success' &&
        d.createdAt <= before
      ) {
        d.status = 'taken_down'
        d.takenDownAt = now()
        d.takenDownBy = takenDownBy
      }
    }
  },

  // API Keys — mirrors the adapter (B3): create validates the project
  // belongs to the organization and stores exactly one level; auth resolves
  // the org from either source and checks the creator's membership; each
  // level lists its own keys; revoke holds a key to its level's place.
  async createApiKey(data) {
    const key: ApiKey = {
      id: data.id,
      organizationId: data.organizationId,
      level: data.level,
      parentKeyId: data.parentKeyId ?? null,
      createdBy: data.createdBy,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      keySuffix: data.keySuffix ?? null,
      scopes: data.scopes,
      permissions: data.permissions,
      expiresAt: data.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now(),
    }
    // All-or-nothing: every scope must be in the key's organization (the one
    // test user is the org owner, so they open every project/workspace).
    if (data.level === 'project') {
      if (data.projectIds.length === 0) return null
      for (const pid of data.projectIds) {
        const p = store.projects.get(pid)
        if (!p || p.organizationId !== data.organizationId) return null
      }
      store.apiKeys.set(key.id, key)
      for (const projectId of new Set(data.projectIds)) {
        store.apiKeyProjects.push({ keyId: key.id, projectId, revokedAt: null })
      }
    } else if (data.level === 'workspace') {
      const proj = store.projects.get(data.projectId)
      if (!proj || proj.organizationId !== data.organizationId) return null
      if (data.workspaceIds.length === 0) return null
      for (const wid of data.workspaceIds) {
        const w = store.workspaces.get(wid)
        if (!w || w.projectId !== data.projectId) return null
      }
      store.apiKeys.set(key.id, key)
      for (const workspaceId of new Set(data.workspaceIds)) {
        store.apiKeyWorkspaces.push({ keyId: key.id, workspaceId, revokedAt: null })
      }
    } else {
      store.apiKeys.set(key.id, key)
    }
    return key
  },
  async getApiKeyById(id) {
    return store.apiKeys.get(id) ?? null
  },
  async getApiKeyAuthByHash(keyHash) {
    const key =
      [...store.apiKeys.values()].find((k) => k.keyHash === keyHash && !k.revokedAt) ?? null
    if (!key) return null
    const parent = key.parentKeyId ? store.apiKeys.get(key.parentKeyId) : undefined
    return {
      ...key,
      // The same membership rule as the isOrgMember mock above.
      createdByIsMember: key.createdBy === TEST_USER_ID && key.organizationId === TEST_ORG_ID,
      createdByRole: key.organizationId === TEST_ORG_ID ? testOrgRole : null,
      projectScopes: liveKeyProjects(key.id),
      workspaceScopes: liveKeyWorkspaces(key.id),
      keyProjectId: key.level === 'workspace' ? keyWorkspaceProject(key.id) : null,
      parentKeyLive:
        !key.parentKeyId ||
        (!!parent &&
          !parent.revokedAt &&
          (!parent.expiresAt || Date.parse(parent.expiresAt) > Date.now())),
    }
  },
  async listApiKeysByOrganization(organizationId) {
    return {
      data: [...store.apiKeys.values()]
        .filter(
          (k) =>
            k.organizationId === organizationId &&
            !k.revokedAt &&
            (k.level === 'organization' ||
              (k.level === 'project' && totalKeyProjects(k.id).length > 1)),
        )
        .map(toKeyListItem),
      nextCursor: null,
    }
  },
  async listApiKeysByProject(organizationId, projectId) {
    const project = store.projects.get(projectId)
    if (!project || project.organizationId !== organizationId) return { own: [], reaching: [] }
    const keys = [...store.apiKeys.values()].filter(
      (k) => k.organizationId === organizationId && !k.revokedAt,
    )
    const own = keys.filter(
      (k) =>
        (k.level === 'project' &&
          totalKeyProjects(k.id).length === 1 &&
          totalKeyProjects(k.id)[0]?.projectId === projectId) ||
        (k.level === 'workspace' &&
          totalKeyWorkspaces(k.id).length > 1 &&
          keyWorkspaceProject(k.id) === projectId),
    )
    // Reaching = multi-project keys with a live slice here; org keys live at the org.
    const reaching = keys.filter(
      (k) =>
        k.level === 'project' &&
        totalKeyProjects(k.id).length > 1 &&
        liveKeyProjects(k.id).includes(projectId),
    )
    return { own: own.map(toKeyListItem), reaching: reaching.map(toKeyListItem) }
  },
  async countApiKeysByWorkspace(projectId) {
    const counts = new Map<string, number>()
    for (const k of store.apiKeys.values()) {
      if (k.level !== 'workspace' || k.revokedAt) continue
      for (const wid of liveKeyWorkspaces(k.id)) {
        if (store.workspaces.get(wid)?.projectId === projectId) {
          counts.set(wid, (counts.get(wid) ?? 0) + 1)
        }
      }
    }
    return [...counts.entries()].map(([id, count]) => {
      const w = store.workspaces.get(id)
      return {
        workspace: { id, slug: w?.slug ?? '', name: w?.name ?? '', colour: w?.colour ?? 'green' },
        count,
      }
    })
  },
  async listApiKeysByWorkspace(workspaceId, nowIso) {
    const project = store.workspaces.get(workspaceId)?.projectId ?? null
    const org = project ? (store.projects.get(project)?.organizationId ?? null) : null
    const unexpired = (k: ApiKey) => !k.expiresAt || k.expiresAt > nowIso
    const keys = [...store.apiKeys.values()].filter((k) => !k.revokedAt)
    const own = keys.filter(
      (k) =>
        k.level === 'workspace' &&
        totalKeyWorkspaces(k.id).length === 1 &&
        totalKeyWorkspaces(k.id)[0]?.workspaceId === workspaceId,
    )
    const reaching = keys.filter(
      (k) =>
        (k.level === 'workspace' &&
          totalKeyWorkspaces(k.id).length > 1 &&
          liveKeyWorkspaces(k.id).includes(workspaceId) &&
          unexpired(k)) ||
        (k.level === 'project' &&
          project !== null &&
          liveKeyProjects(k.id).includes(project) &&
          unexpired(k)) ||
        (k.level === 'organization' && org !== null && k.organizationId === org && unexpired(k)),
    )
    return { own: own.map(toKeyListItem), reaching: reaching.map(toKeyListItem) }
  },
  async updateApiKeyLastUsed(id, lastUsedAt) {
    const k = store.apiKeys.get(id)
    if (k) store.apiKeys.set(id, { ...k, lastUsedAt })
  },
  async revokeApiKey(id, target) {
    const k = store.apiKeys.get(id)
    if (!k || k.revokedAt) return null
    const at =
      target.level === 'organization'
        ? k.organizationId === target.organizationId &&
          (k.level === 'organization' ||
            (k.level === 'project' && totalKeyProjects(k.id).length > 1))
        : target.level === 'project'
          ? (k.level === 'project' &&
              totalKeyProjects(k.id).length === 1 &&
              totalKeyProjects(k.id)[0]?.projectId === target.projectId) ||
            (k.level === 'workspace' &&
              totalKeyWorkspaces(k.id).length > 1 &&
              keyWorkspaceProject(k.id) === target.projectId)
          : k.level === 'workspace' &&
            totalKeyWorkspaces(k.id).length === 1 &&
            totalKeyWorkspaces(k.id)[0]?.workspaceId === target.workspaceId
    if (!at) return null
    const revoked = { ...k, revokedAt: now() }
    store.apiKeys.set(id, revoked)
    return revoked
  },
  async revokeApiKeyScope(target) {
    const rows = target.level === 'project' ? store.apiKeyProjects : store.apiKeyWorkspaces
    const row = rows.find(
      (r) =>
        r.keyId === target.keyId &&
        !r.revokedAt &&
        (target.level === 'project'
          ? (r as { projectId: string }).projectId === target.projectId
          : (r as { workspaceId: string }).workspaceId === target.workspaceId),
    )
    if (!row) return null
    row.revokedAt = now()
    const live = rows.filter((r) => r.keyId === target.keyId && !r.revokedAt).length
    const k = store.apiKeys.get(target.keyId)
    if (k && !k.revokedAt && live === 0) store.apiKeys.set(target.keyId, { ...k, revokedAt: now() })
    return store.apiKeys.get(target.keyId) ?? null
  },

  // Env Vars — store-backed, mirroring the real adapter: one row per level
  // (B4), a write pinned to its place, one name per level, the closest
  // level's value per name when resolving.
  async createEnvVar(data) {
    const { place } = data
    if (place.level !== 'organization') {
      const project = store.projects.get(place.projectId)
      if (!project || project.organizationId !== place.organizationId) return null
      if (place.level === 'workspace') {
        const workspace = store.workspaces.get(place.workspaceId)
        if (!workspace || workspace.projectId !== place.projectId) return null
      }
    }
    const row: EnvVar = {
      id: data.id,
      organizationId: place.organizationId,
      projectId: place.level === 'organization' ? null : place.projectId,
      workspaceId: place.level === 'workspace' ? place.workspaceId : null,
      createdBy: data.createdBy,
      name: data.name,
      value: data.value,
      isSecret: data.isSecret,
      allPlaces: data.allPlaces ?? true,
      createdAt: now(),
      updatedAt: now(),
    }
    for (const v of store.envVars.values()) {
      if (v.name === row.name && envVarAtPlace(v, place)) throw uniqueViolation()
    }
    store.envVars.set(row.id, row)
    return row
  },
  async listEnvVarsByOrganization(organizationId) {
    const rows = [...store.envVars.values()]
    return {
      data: rows
        .filter((v) => v.organizationId === organizationId && v.projectId === null)
        .map((v) => ({
          ...v,
          overriddenIn: new Set(
            rows.filter((o) => o.projectId !== null && o.name === v.name).map((o) => o.projectId),
          ).size,
          reach: envVarReach(v),
        })),
      nextCursor: null,
    }
  },
  async listEnvVarsByProject(organizationId, projectId) {
    return {
      data: [...store.envVars.values()].filter(
        (v) =>
          v.organizationId === organizationId &&
          v.projectId === projectId &&
          v.workspaceId === null,
      ),
      nextCursor: null,
    }
  },
  async listEnvVarsByWorkspace(organizationId, projectId, workspaceId) {
    return {
      data: [...store.envVars.values()].filter(
        (v) =>
          v.organizationId === organizationId &&
          v.projectId === projectId &&
          v.workspaceId === workspaceId,
      ),
      nextCursor: null,
    }
  },
  async listResolvedVariablesForProject(organizationId, projectId) {
    const rows = [...store.envVars.values()].filter((v) => v.organizationId === organizationId)
    const own = rows.filter((v) => v.projectId === projectId && v.workspaceId === null)
    const ownNames = new Set(own.map((v) => v.name))
    const org = rows.filter(
      (v) => v.projectId === null && !ownNames.has(v.name) && envVarReaches(v, projectId),
    )
    const byName = (a: EnvVar, b: EnvVar) => a.name.localeCompare(b.name)
    return [...own.sort(byName), ...org.sort(byName)].map((v) => {
      const level = envVarLevel(v) as 'organization' | 'project'
      const overriding = rows.filter((o) => o.workspaceId !== null && o.name === v.name)
      return {
        ...v,
        level,
        setAt: { level, id: v.projectId ?? v.organizationId, name: null },
        reach: level === 'project' ? envVarReach(v) : null,
        overriddenIn: overriding.flatMap((o) => {
          const w = store.workspaces.get(o.workspaceId!)
          return w && w.projectId === projectId
            ? [{ id: w.id, slug: w.slug, name: w.name, colour: w.colour }]
            : []
        }),
      }
    })
  },
  async listResolvedVariablesForWorkspace(organizationId, projectId, workspaceId) {
    const inPlace = [...store.envVars.values()]
      .filter(
        (v) =>
          v.organizationId === organizationId &&
          (v.workspaceId === workspaceId ||
            (v.projectId === projectId &&
              v.workspaceId === null &&
              envVarReaches(v, projectId, workspaceId)) ||
            (v.projectId === null && envVarReaches(v, projectId))),
      )
      .sort((a, b) => envVarRank(a) - envVarRank(b) || a.name.localeCompare(b.name))
    const seen = new Set<string>()
    const winners: EnvVar[] = []
    for (const v of inPlace) {
      if (seen.has(v.name)) continue
      seen.add(v.name)
      winners.push(v)
    }
    return winners.map((v) => {
      const level = envVarLevel(v)
      const below = inPlace.find((o) => o.name === v.name && envVarRank(o) > envVarRank(v))
      const overrides = below ? envVarLevel(below) : null
      return {
        ...v,
        level,
        source: { level, id: v.workspaceId ?? v.projectId ?? v.organizationId, name: null },
        overrides: overrides === 'project' || overrides === 'organization' ? overrides : null,
      }
    })
  },
  async updateEnvVar(id, place, data) {
    const v = store.envVars.get(id)
    if (!v || !envVarAtPlace(v, place)) return null
    // Mirrors the adapter's reveal guard: a stored secret cannot become
    // readable by flipping the flag without a replacement value.
    if (data.isSecret === false && data.value === undefined && v.isSecret) return null
    if (data.name !== undefined && data.name !== v.name) {
      for (const o of store.envVars.values()) {
        if (o.id !== id && o.name === data.name && envVarAtPlace(o, place)) throw uniqueViolation()
      }
    }
    const updated = { ...v, ...data, updatedAt: now() }
    store.envVars.set(id, updated)
    return updated
  },
  async createEnvVarWithReach(data, placeIds) {
    const ids = [...new Set(placeIds)]
    const { place } = data
    if (place.level === 'workspace') return { failure: 'missing' }
    const belongs = (placeId: string) =>
      place.level === 'project'
        ? store.workspaces.get(placeId)?.projectId === place.projectId
        : store.projects.get(placeId)?.organizationId === place.organizationId
    if (!ids.every(belongs)) return { failure: 'unknown' }
    const own = (placeId: string) =>
      [...store.envVars.values()].some((o) =>
        place.level === 'project'
          ? o.workspaceId === placeId && o.name === data.name
          : o.projectId === placeId && o.workspaceId === null && o.name === data.name,
      )
    const reached = ids.filter((placeId) => !own(placeId))
    if (reached.length === 0) return { failure: 'taken' }
    const row = await mockDb.createEnvVar({ ...data, allPlaces: false })
    if (!row) return { failure: 'missing' }
    store.envVarReach.set(row.id, new Set(reached))
    return { row, reached: reached.sort() }
  },
  async updateEnvVarWithReach(id, place, data, placeIds) {
    const v = store.envVars.get(id)
    if (!v || place.level === 'workspace' || !envVarAtPlace(v, place)) return { failure: 'missing' }
    const ids = [...new Set(placeIds)]
    const belongs = (placeId: string) =>
      place.level === 'project'
        ? store.workspaces.get(placeId)?.projectId === place.projectId
        : store.projects.get(placeId)?.organizationId === place.organizationId
    if (!ids.every(belongs)) return { failure: 'unknown' }
    if (v.allPlaces) return { failure: 'narrowing' }
    const row = await mockDb.updateEnvVar(id, place, data)
    if (!row) return { failure: 'missing' }
    const listed = store.envVarReach.get(id) ?? new Set<string>()
    for (const placeId of ids) {
      const taken = [...store.envVars.values()].some((o) =>
        place.level === 'project'
          ? o.workspaceId === placeId && o.name === row.name
          : o.projectId === placeId && o.workspaceId === null && o.name === row.name,
      )
      if (!taken) listed.add(placeId)
    }
    store.envVarReach.set(id, listed)
    return { row, reached: ids.filter((p) => listed.has(p)).sort() }
  },
  async deleteEnvVar(id, place) {
    const v = store.envVars.get(id)
    if (!v || !envVarAtPlace(v, place)) return null
    store.envVars.delete(id)
    store.envVarReach.delete(id)
    return v.name
  },
  async getWorkflowEnvVars(workflowId) {
    const workflow = store.workflows.get(workflowId)
    return workflow ? mockDb.decodeWorkflowEnvVars(workflow) : []
  },
  async decodeWorkflowEnvVars() {
    return []
  },
  async setWorkflowEnvVars() {},
  async isSecretVariableAt(id, place) {
    const v = store.envVars.get(id)
    return !!v && envVarAtPlace(v, place) && v.isSecret
  },
  async findEnvVarsByNames(organizationId, names, projectId, workspaceId) {
    if (names.length === 0) return []
    const wanted = new Set(names)
    const inPlace = [...store.envVars.values()]
      .filter(
        (v) =>
          v.organizationId === organizationId &&
          wanted.has(v.name) &&
          ((v.projectId === null && (projectId ? envVarReaches(v, projectId) : v.allPlaces)) ||
            (!!projectId &&
              v.projectId === projectId &&
              v.workspaceId === null &&
              envVarReaches(v, projectId, workspaceId)) ||
            (!!workspaceId && v.workspaceId === workspaceId)),
      )
      .sort((a, b) => envVarRank(a) - envVarRank(b))
    const seen = new Set<string>()
    return inPlace.filter((v) => !seen.has(v.name) && seen.add(v.name) !== null)
  },

  // Installed Nodes
  async installNode(data) {
    const node: InstalledNode = {
      ...data,
      installedAt: now(),
      updatedAt: now(),
    }
    store.installedNodes.set(`${data.organizationId}:${data.nodeId}`, node)
    return node
  },
  async uninstallNode(organizationId, nodeId) {
    store.installedNodes.delete(`${organizationId}:${nodeId}`)
  },
  async listNodeUsage(organizationId) {
    return [...store.installedNodes.values()]
      .filter((n) => n.organizationId === organizationId)
      .map((n) => ({
        nodeId: n.nodeId,
        version: n.version,
        name: null,
        category: null,
        description: null,
        usage: 0,
      }))
  },
  async listInstalledNodes(organizationId) {
    return {
      data: [...store.installedNodes.values()].filter((n) => n.organizationId === organizationId),
      nextCursor: null,
    }
  },
  async getInstalledNode(organizationId, nodeId) {
    return store.installedNodes.get(`${organizationId}:${nodeId}`) ?? null
  },
  async updateInstalledNodeBundle(organizationId, nodeId, data) {
    const key = `${organizationId}:${nodeId}`
    const n = store.installedNodes.get(key)
    if (!n) throw new Error('Not found')
    const updated = { ...n, ...data, updatedAt: now() }
    store.installedNodes.set(key, updated)
    return updated
  },

  // The Library runs on the real database (sqlite-app.ts). Here one item
  // exists, so the route guards can be probed past its lookup.
  async getLibraryItemForUser(_userId: string, itemId: string) {
    if (itemId !== 'lib-1') return null
    return {
      item: {
        id: 'lib-1',
        projectId: TEST_PROJECT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        kind: 'module' as const,
        slug: 'fmt',
        name: 'Fmt',
        description: '',
        createdBy: TEST_USER_ID,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      organizationId: TEST_ORG_ID,
      owner: { kind: 'workspace' as const, id: TEST_WORKSPACE_ID, name: 'Default' },
      latestVersion: null,
      latestSeq: 0,
      orgRole: 'owner',
      projectGrant: null,
      workspaceGrant: null,
    }
  },
  async createLibraryItem() {
    return notMocked('createLibraryItem')
  },
  async updateLibraryItem() {
    return notMocked('updateLibraryItem')
  },
  async deleteLibraryItemIfUnused() {
    return notMocked('deleteLibraryItemIfUnused')
  },
  async getLibrarySummary() {
    return notMocked('getLibrarySummary')
  },
  async listLibraryFiles() {
    return notMocked('listLibraryFiles')
  },
  async listLibraryFileSummaries() {
    return notMocked('listLibraryFileSummaries')
  },
  async getLibraryFile() {
    return notMocked('getLibraryFile')
  },
  async upsertLibraryFile() {
    return notMocked('upsertLibraryFile')
  },
  async createLibraryFile() {
    return notMocked('createLibraryFile')
  },
  async updateLibraryFileIfMatches() {
    return notMocked('updateLibraryFileIfMatches')
  },
  async deleteLibraryFile() {
    return notMocked('deleteLibraryFile')
  },
  async libraryVersionExists() {
    return notMocked('libraryVersionExists')
  },
  async getLibraryVersionFile() {
    return notMocked('getLibraryVersionFile')
  },
  async getLibraryTree() {
    return notMocked('getLibraryTree')
  },
  async listLibraryVersions() {
    return notMocked('listLibraryVersions')
  },
  async getLibraryVersion() {
    return notMocked('getLibraryVersion')
  },
  async listLibraryVersionImports() {
    return notMocked('listLibraryVersionImports')
  },
  async resolveLibraryModules() {
    return notMocked('resolveLibraryModules')
  },
  async publishLibraryVersion() {
    return notMocked('publishLibraryVersion')
  },
  async restoreLibraryVersion() {
    return notMocked('restoreLibraryVersion')
  },
  async rewriteLibraryUsages() {
    return notMocked('rewriteLibraryUsages')
  },
  async getLibraryUsages() {
    return notMocked('getLibraryUsages')
  },
  async getLibraryConsumers() {
    return notMocked('getLibraryConsumers')
  },

  // Uploaded images: the routes that store them run on the real database
  // (sqlite-app.ts). The maintenance jobs find nothing here.
  async insertImage() {
    return notMocked('insertImage')
  },
  async insertImages() {
    return notMocked('insertImages')
  },
  async setImageData() {
    return notMocked('setImageData')
  },
  async getImageData() {
    return null
  },
  async getImage() {
    return null
  },
  async setOwnerImage() {
    return notMocked('setOwnerImage')
  },
  async clearOwnerImage() {
    return notMocked('clearOwnerImage')
  },
  async listOwnerImages() {
    return []
  },
  async listUnreferencedImages() {
    return []
  },
  async claimImages() {
    return []
  },
  async deleteImages() {},
  async existingImages() {
    return []
  },
  async listInlineImages() {
    return []
  },
  async replaceInlineImages() {},
  async clearRemoteImages() {},
}

/** A stored connection as the list shows it: the fake keeps no names, projects or deployments. */
function listedConnection(c: Connection): ConnectionListRow {
  return {
    ...c,
    createdByName: null,
    projects: [],
    hiddenProjects: 0,
    deployments: { count: 0, lastAt: null },
  }
}

let lastAuthRequest: Request | null = null
let lastSessionLookupHeaders: Headers | null = null

/** The request the app last handed better-auth — what its handler sees. */
export function lastAuthHandlerRequest(): Request | null {
  return lastAuthRequest
}

/** The headers the app last looked a session up with. */
export function lastSessionHeaders(): Headers | null {
  return lastSessionLookupHeaders
}

const mockAuth = {
  handler: async (req: Request) => {
    lastAuthRequest = req
    return new Response(JSON.stringify({ ok: true }))
  },
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      lastSessionLookupHeaders = headers
      return {
        user: { id: TEST_USER_ID, email: 'test@example.com', name: 'Test' },
        session: {
          id: 'session-1',
          userId: TEST_USER_ID,
          expiresAt: new Date(Date.now() + 86400000),
          activeOrganizationId: TEST_ORG_ID,
        },
      }
    },
  },
} as unknown as Auth

/**
 * Fixture escape hatch: a workflow's `kind` is fixed at creation and cannot be
 * changed through the adapter's update path, so tests that need an existing
 * fixture to be a script set it here.
 */
export function setWorkflowKind(id: string, kind: 'workflow' | 'script') {
  const workflow = store.workflows.get(id)
  if (!workflow) throw new Error(`No workflow ${id} in the test store`)
  store.workflows.set(id, { ...workflow, kind })
}

export { mockDb, mockAuth }

/**
 * A runner that records what it was asked to do. Every lifecycle decision —
 * what gets started, what gets stopped, in which order — is visible here, so
 * the route tests assert on the protocol rather than on a container.
 */
export class FakeTestSessionRunner implements TestSessionRunner {
  readonly runtime = 'node' as const
  started: string[] = []
  stopped: string[] = []
  triggers: { sessionId: string; payload: unknown }[] = []
  failStart: string | Error | null = null
  logs_: ProcessLogEntry[] = []

  containerId(sessionId: string) {
    return `fake-${sessionId}`
  }

  async start(_bundle: GeneratedBundle, target: TestSessionTarget) {
    if (this.failStart) {
      throw typeof this.failStart === 'string' ? new Error(this.failStart) : this.failStart
    }
    this.started.push(target.sessionId)
    return { processId: `pid-${target.sessionId}`, port: 8800 }
  }

  async trigger(handle: StartedTestSessionHandle, payload: unknown) {
    this.triggers.push({ sessionId: handle.sessionId, payload })
    return { status: 200, body: { instanceId: 'inst-1' } }
  }

  async instanceStatus() {
    return { status: 200, body: { status: 'complete' } }
  }

  async logs(_handle: StartedTestSessionHandle, after?: string) {
    const seen = Number(after ?? 0)
    return { entries: this.logs_.slice(seen), cursor: String(this.logs_.length) }
  }

  async stop(handle: { sessionId: string }) {
    this.stopped.push(handle.sessionId)
  }
}

// The test project and its Default workspace: what every request resolves
// against. Seeded by resetStore, so a test that only uses the mock db has it too.
function seedTestProject() {
  store.projects.set(TEST_PROJECT_ID, {
    id: TEST_PROJECT_ID,
    organizationId: TEST_ORG_ID,
    name: 'Test Project',
    slug: TEST_PROJECT_SLUG,
    description: null,
    lockedBy: null,
    lockedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  store.workspaces.set(TEST_WORKSPACE_ID, {
    id: TEST_WORKSPACE_ID,
    projectId: TEST_PROJECT_ID,
    name: 'Default',
    slug: 'default',
    description: null,
    colour: 'green',
    createdBy: TEST_USER_ID,
    lockedBy: null,
    lockedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
}

export function createTestApp(options?: {
  remoteNodeRegistry?: AppDeps['remoteNodeRegistry']
  testSessionRunner?: AppDeps['testSessionRunner']
  testSessionLimits?: AppDeps['testSessionLimits']
  /** A concrete origin turns CSRF checking on, as a deployment has it. */
  corsOrigin?: AppDeps['corsOrigin']
  enableLocalDev?: AppDeps['enableLocalDev']
  connectionAddress?: AppDeps['connectionAddress']
  clientIpPolicy?: AppDeps['clientIpPolicy']
  logger?: AppDeps['logger']
  cloudflareOAuth?: AppDeps['cloudflareOAuth']
  webUrl?: AppDeps['webUrl']
}) {
  seedTestProject()

  return createApp({
    db: mockDb,
    auth: mockAuth,
    corsOrigin: options?.corsOrigin ?? '*',
    isDev: true,
    cloudflareOAuth: options?.cloudflareOAuth,
    webUrl: options?.webUrl,
    remoteNodeRegistry: options?.remoteNodeRegistry,
    testSessionRunner: options?.testSessionRunner,
    testSessionLimits: options?.testSessionLimits,
    ...(options?.enableLocalDev !== undefined && { enableLocalDev: options.enableLocalDev }),
    ...(options?.connectionAddress && { connectionAddress: options.connectionAddress }),
    ...(options?.clientIpPolicy && { clientIpPolicy: options.clientIpPolicy }),
    ...(options?.logger && { logger: options.logger }),
  })
}

/** What the routes sent to the fake's Inbox, oldest first. */
export function sentNotifications(): readonly NotificationInsert[] {
  return store.notifications
}

/** The person-wide events (sign-ins, account changes) the routes wrote, oldest first. */
export function recordedPersonAuditEvents(): readonly PersonAuditInsert[] {
  return store.personAuditEvents
}

/** What the routes recorded in the fake's audit log, oldest first. */
export function recordedAuditEvents(): readonly AuditEventInsert[] {
  return store.auditEvents
}
