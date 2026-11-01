import type {
  DatabaseAdapter,
  Workflow,
  WorkflowVersion,
  Connection,
  ConnectionListRow,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowFile,
  TestSession,
  TestSessionCutoffs,
  TestSessionExpiry,
  ApiKey,
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
  deployments: new Map<string, Deployment>(),
  projects: new Map<string, Project>(),
  workspaces: new Map<string, Workspace>(),
  installedNodes: new Map<string, InstalledNode>(),
  envVars: new Map<string, EnvVar>(),
  auditEvents: [] as AuditEventInsert[],
  personAuditEvents: [] as PersonAuditInsert[],
  notifications: [] as NotificationInsert[],
}

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
  store.deployments.clear()
  store.projects.clear()
  store.workspaces.clear()
  store.installedNodes.clear()
  testOrgRole = 'owner'
  seedTestProject()
  store.envVars.clear()
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

function envVarLevel(v: EnvVar): 'organization' | 'project' | 'workspace' {
  if (v.workspaceId) return 'workspace'
  return v.projectId ? 'project' : 'organization'
}

/** Closest level first, as the adapter ranks them. */
function envVarRank(v: EnvVar): number {
  return v.workspaceId ? 0 : v.projectId ? 1 : 2
}

/** A name already set at the place: what the level's unique index raises. */
function uniqueViolation(): Error {
  return Object.assign(new Error('UNIQUE constraint failed: env_vars.name'), {
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
    const updated = { ...w, ...data, updatedAt: now() }
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
    return { data, nextCursor: null, counts }
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
    const maxExisting = Math.max(
      0,
      ...[...store.versions.values()]
        .filter((v) => v.workflowId === data.workflowId)
        .map((v) => v.version),
    )
    const assigned = data.version ?? maxExisting + 1
    const v: WorkflowVersion = {
      // The dead source columns, as a real row comes back from the adapter —
      // mirrored here, not configurable, because `CreateVersionData` no
      // longer carries them. Both copies go in the Phase 2 cleanup.
      sourceMode: 'generated',
      source: null,
      manifest: null,
      baseGeneratedHash: null,
      ...data,
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
  async listVersionsByWorkflow(workflowId) {
    return {
      data: [...store.versions.values()]
        .filter((v) => v.workflowId === workflowId)
        .sort((a, b) => b.version - a.version),
      nextCursor: null,
    }
  },
  async updateVersion(id, data) {
    const v = store.versions.get(id)
    if (!v) throw new Error('Not found')
    store.versions.set(id, { ...v, ...data })
  },
  async deleteVersion(id) {
    store.versions.delete(id)
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
  async getConnectionDeployedWith(id, organizationId, workflowId) {
    const connection = store.connections.get(id)
    if (!connection || connection.organizationId !== organizationId) return null
    const deployed = [...store.deployments.values()].some(
      (d) => d.workflowId === workflowId && d.connectionId === id && d.status === 'success',
    )
    return deployed ? connection : null
  },
  async getConnectionForProject(id, organizationId) {
    const connection = store.connections.get(id)
    if (!connection || connection.organizationId !== organizationId) return null
    return { connection, covered: true }
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
  async listConnectionsDeployedWith() {
    return notMocked('listConnectionsDeployedWith')
  },
  async listDeployTargets() {
    return notMocked('listDeployTargets')
  },

  // Runs
  async createRun(data) {
    const r: WorkflowRun = {
      ...data,
      output: null,
      error: null,
      createdAt: now(),
      updatedAt: now(),
    }
    store.runs.set(r.id, r)
    return r
  },
  async getWorkflowRunById(id) {
    return store.runs.get(id) ?? null
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
  async listActiveRunsForSync() {
    const terminal = new Set(['complete', 'errored', 'terminated'])
    return [...store.runs.values()]
      .filter((r) => !terminal.has(r.status))
      .map((run) => {
        const deployment = [...store.deployments.values()]
          .filter(
            (d) =>
              d.workflowId === run.workflowId &&
              d.versionId === run.versionId &&
              d.status === 'success',
          )
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
        return {
          run,
          workflowName: store.workflows.get(run.workflowId)?.name ?? '',
          configSnapshot: deployment?.configSnapshot ?? null,
          place: syncPlace(run.workflowId),
        }
      })
  },

  async getRunForSync(runId, workflowId) {
    const run = store.runs.get(runId)
    if (!run || run.workflowId !== workflowId) return null
    const [entry] = (await this.listActiveRunsForSync()).filter((e) => e.run.id === runId)
    return (
      entry ?? {
        run,
        workflowName: store.workflows.get(run.workflowId)?.name ?? '',
        configSnapshot: null,
        place: syncPlace(run.workflowId),
      }
    )
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
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      })
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
    const steps = [...store.runSteps.values()].filter((s) => s.runId === runId)
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
      connectionId: data.connectionId ?? null,
      serviceUrl: data.serviceUrl ?? null,
      error: data.error ?? null,
      configSnapshot: data.configSnapshot ?? null,
      createdAt: now(),
    }
    store.deployments.set(d.id, d)
    return d
  },
  async getActiveDeployment(workflowId) {
    return (
      [...store.deployments.values()]
        .filter((d) => d.workflowId === workflowId && d.status === 'success')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    )
  },
  async isActiveDeploymentLocked(workflowId) {
    // Mirrors the real query: inner join on the version (a deployment whose
    // version is gone drops out), newest first, and the later-inserted row
    // wins a tie in createdAt — picking the first match answered for the
    // oldest deployment instead.
    const candidate = [...store.deployments.values()]
      .filter((d) => d.workflowId === workflowId && d.status === 'success')
      .filter((d) => d.versionId !== null && store.versions.has(d.versionId))
      .reverse()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!candidate?.versionId) return false
    return store.versions.get(candidate.versionId)?.locked === 1
  },
  async listDeploymentsByWorkflow(workflowId) {
    return {
      data: [...store.deployments.values()]
        .filter((d) => d.workflowId === workflowId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
  async deleteDeploymentsByWorkflow(workflowId) {
    for (const [id, d] of store.deployments) {
      if (d.workflowId === workflowId) store.deployments.delete(id)
    }
  },

  // API Keys — mirrors the adapter (B3): create validates the project
  // belongs to the organization and stores exactly one level; auth resolves
  // the org from either source and checks the creator's membership; each
  // level lists its own keys; revoke holds a key to its level's place.
  async createApiKey(data) {
    if (data.level !== 'organization') {
      const project = store.projects.get(data.projectId)
      if (!project || project.organizationId !== data.organizationId) return null
    }
    const key: ApiKey = {
      id: data.id,
      projectId: data.level === 'organization' ? null : data.projectId,
      organizationId: data.level === 'organization' ? data.organizationId : null,
      workspaceId: data.level === 'workspace' ? data.workspaceId : null,
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
    store.apiKeys.set(key.id, key)
    return key
  },
  async getApiKeyById(id) {
    return store.apiKeys.get(id) ?? null
  },
  async getApiKeyAuthByHash(keyHash) {
    const key =
      [...store.apiKeys.values()].find((k) => k.keyHash === keyHash && !k.revokedAt) ?? null
    if (!key) return null
    const projectOrg = key.projectId
      ? (store.projects.get(key.projectId)?.organizationId ?? null)
      : null
    const resolvedOrganizationId = key.organizationId ?? projectOrg
    const parent = key.parentKeyId ? store.apiKeys.get(key.parentKeyId) : undefined
    return {
      ...key,
      resolvedOrganizationId,
      // The same membership rule as the isOrgMember mock above.
      createdByIsMember: key.createdBy === TEST_USER_ID && resolvedOrganizationId === TEST_ORG_ID,
      createdByRole: resolvedOrganizationId === TEST_ORG_ID ? testOrgRole : null,
      createdByProjectGrant:
        resolvedOrganizationId === TEST_ORG_ID ? testGrantRows().projectGrant : null,
      createdByHasWorkspaceGrant: false,
      // The one person is the org owner (or a member of every project): they open every workspace.
      createdByCanOpenWorkspace: true,
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
        .filter((k) => k.organizationId === organizationId && !k.revokedAt)
        .map((k) => ({ ...k, projectName: null, createdByName: null, workspace: null })),
      nextCursor: null,
    }
  },
  async listApiKeysByProject(organizationId, projectId) {
    const project = store.projects.get(projectId)
    if (!project || project.organizationId !== organizationId) {
      return { data: [], nextCursor: null }
    }
    return {
      data: [...store.apiKeys.values()]
        .filter((k) => k.projectId === projectId && k.workspaceId === null && !k.revokedAt)
        .map((k) => ({ ...k, projectName: project.name, createdByName: null, workspace: null })),
      nextCursor: null,
    }
  },
  async countApiKeysByWorkspace() {
    return []
  },
  async listApiKeysByWorkspace(workspaceId) {
    const own = [...store.apiKeys.values()]
      .filter((k) => k.workspaceId === workspaceId && !k.revokedAt)
      .map((k) => ({ ...k, projectName: null, createdByName: null, workspace: null }))
    return { own, inherited: [] }
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
        ? k.organizationId === target.organizationId
        : target.level === 'project'
          ? k.projectId === target.projectId && k.workspaceId === null
          : k.workspaceId === target.workspaceId
    if (!at) return null
    const revoked = { ...k, revokedAt: now() }
    store.apiKeys.set(id, revoked)
    return revoked
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
    const org = rows.filter((v) => v.projectId === null && !ownNames.has(v.name))
    const byName = (a: EnvVar, b: EnvVar) => a.name.localeCompare(b.name)
    return [...own.sort(byName), ...org.sort(byName)].map((v) => {
      const level = envVarLevel(v) as 'organization' | 'project'
      const overriding = rows.filter((o) => o.workspaceId !== null && o.name === v.name)
      return {
        ...v,
        level,
        setAt: { level, id: v.projectId ?? v.organizationId, name: null },
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
            (v.projectId === projectId && v.workspaceId === null) ||
            v.projectId === null),
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
  async deleteEnvVar(id, place) {
    const v = store.envVars.get(id)
    if (!v || !envVarAtPlace(v, place)) return null
    store.envVars.delete(id)
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
          (v.projectId === null ||
            (!!projectId && v.projectId === projectId && v.workspaceId === null) ||
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
}) {
  seedTestProject()

  return createApp({
    db: mockDb,
    auth: mockAuth,
    corsOrigin: options?.corsOrigin ?? '*',
    isDev: true,
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
