import type {
  Allowed,
  OrgCapability,
  OrgRole,
  ProjectCapability,
  ProjectRole,
  WorkspaceCapability,
  WorkspaceColour,
  WorkspaceRole,
  KeyLevel,
  KeyPermissions,
  ScopeLevel,
  AuditFilter,
  AuditPage,
  InboxPage,
  ReleaseVisit,
  ConnectionSummary,
  ProjectSetup,
} from '@awaitstep/ir'
import {
  request,
  type PaginatedResponse,
  type RunSummary,
  type WorkflowSummary,
} from './api-client'

// The dashboard's calls, addressed by the slugs its URLs carry rather than
// by the org store: `GET /scope`, the workspace routes, and the project,
// workflow and run routes with their workspace filters.

export type ApiCapabilities<C extends string> = Record<C, Allowed>

export interface ApiMember {
  id: string
  name: string
  email: string
  image: string | null
  role: OrgRole
}

/** Someone who can open a workspace, with their effective role there and where it comes from. */
export interface ApiWorkspacePerson {
  id: string
  name: string
  email: string
  image: string | null
  role: WorkspaceRole
  inherited: boolean
  projectRole: WorkspaceRole | null
  orgRole: 'owner' | 'admin' | null
  lastActiveAt: string | null
}

export interface ApiAccessPlace {
  project: { id: string; name: string; workspaceCount: number }
  workspace: { id: string; name: string } | null
  role: ProjectRole | WorkspaceRole
}

export interface ApiOrgMember extends ApiMember {
  joinedAt: string
  places: ApiAccessPlace[]
}

export interface ApiPersonAccess {
  person: { id: string; name: string; email: string; image: string | null }
  joinedAt: string
  orgRole: OrgRole
  projects: { id: string; name: string; workspaces: ApiWorkspaceChip[] }[]
  projectRoles: Record<string, ProjectRole>
  workspaceRoles: Record<string, WorkspaceRole>
}

export type ApiProjectWideRole = 'owner' | 'org-admin' | 'project-admin' | 'project-member'

export interface ApiProjectMembers {
  wholeProject: { person: ApiPersonAccess['person']; role: ApiProjectWideRole }[]
  workspacesOnly: {
    person: ApiPersonAccess['person']
    workspaces: { workspace: ApiWorkspaceChip; role: WorkspaceRole }[]
  }[]
}

export interface ApiAccessGrant {
  orgRole: OrgRole
  projects: { projectId: string; role: ProjectRole }[]
  workspaces: { workspaceId: string; role: WorkspaceRole }[]
}

export interface ApiInvitation {
  id: string
  email: string
  role: OrgRole
  places: {
    kind: 'project' | 'workspace'
    project: string
    workspace: string | null
    role: ProjectRole | WorkspaceRole
  }[]
  sentAt: string
  expiresAt: string
  invitedBy: { id: string; name: string }
  askedForNewAt: string | null
}

export interface ApiInviteDetails {
  token: string
  org: { name: string; slug: string; logo: string | null }
  invitedBy: { id: string; name: string; email: string; image: string | null }
  email: string
  orgRole: OrgRole
  place:
    | { kind: 'workspace'; name: string; projectName: string; role: WorkspaceRole }
    | { kind: 'project'; name: string; role: ProjectRole }
    | null
  sentAt: string
  expiresAt: string
}

export type ApiInviteView =
  | { state: 'open'; invite: ApiInviteDetails; viewerEmail: string }
  | { state: 'declined'; invite: ApiInviteDetails; viewerEmail: string }
  | { state: 'wrong-account'; invite: ApiInviteDetails; viewerEmail: string }
  | { state: 'expired'; invite: ApiInviteDetails; askedForNew: boolean }
  | { state: 'gone' }

export interface ApiPendingInvite {
  token: string
  org: { name: string; slug: string; logo: string | null }
  invitedBy: string
  orgRole: OrgRole
  expiresAt: string
}

export interface ApiAccessRequest {
  id: string
  workspaceId: string
  from: { id: string; name: string }
  to: { id: string; name: string }
  status: 'pending' | 'approved' | 'declined'
  at: string
}

export interface ApiLock {
  setBy: { id: string; name: string }
  setAt: string
}

export interface ApiOrg {
  id: string
  slug: string
  name: string
  logo: string | null
  createdAt: string
  role: OrgRole
  projectCount: number
  memberCount: number
  viewerCan: ApiCapabilities<OrgCapability>
}

export interface ApiWorkspaceChip {
  id: string
  slug: string
  name: string
  colour: WorkspaceColour
}

export interface ApiProject {
  id: string
  organizationId: string
  slug: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  workspaces: ApiWorkspaceChip[]
  health: { workflows: number; deployed: number; failing: number; lastRunAt: string | null }
  lock: ApiLock | null
  /** Who can open a workspace the caller can open, with their org role. */
  members: ApiMember[]
  /** Null for someone who reaches the project through a workspace grant alone. */
  viewerRole: ProjectRole | null
  viewerCan: ApiCapabilities<ProjectCapability>
}

export interface ApiWorkspace {
  id: string
  projectId: string
  slug: string
  name: string
  description: string | null
  colour: WorkspaceColour
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  lock: ApiLock | null
  inheritedLock: { fromName: string; lock: ApiLock } | null
  counts: {
    workflows: number
    deployed: number
    functions: number
    sharedOut: number
    runs24h: number
    failing: number
    lastRunAt: string | null
  }
  members: ApiWorkspacePerson[]
  viewerRole: WorkspaceRole
  viewerCan: ApiCapabilities<WorkspaceCapability>
}

/** A workspace as stored, which create and update answer with. */
export interface ApiWorkspaceRow {
  id: string
  projectId: string
  slug: string
  name: string
  description: string | null
  colour: WorkspaceColour
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiProjectRow {
  id: string
  organizationId: string
  slug: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type ApiScope =
  | {
      found: true
      org: ApiOrg & { members: ApiMember[] }
      project?: ApiProject
      workspace?: ApiWorkspace
    }
  | {
      found: false
      notFound: {
        kind: 'organization' | 'project' | 'workspace'
        slug: string
        parent: { name: string; slug: string } | null
      }
    }

/** A workflow's share to its project; null while it is not shared. */
export interface ApiSharing {
  sharedAt: string
  sharedBy: { id: string; name: string }
}

/** An item shared to the project, as the Shared library and "Shared with" lists read it. */
export interface ApiSharedItem extends ApiSharing {
  id: string
  name: string
  kind: 'workflow' | 'script'
  version: number | null
  from: { id: string; slug: string; name: string; colour: WorkspaceColour }
  usedBy: { id: string; slug: string; name: string; colour: WorkspaceColour }[]
  /** Whether the viewer can open its workspace (sharing shows metadata, not the item). */
  canOpen: boolean
  unshare: { allowed: boolean; reason?: string }
}

export interface ApiWorkflowRow extends WorkflowSummary {
  workspaceId: string
  deployedVersion: number | null
  sharing: ApiSharing | null
  /** The last ten finished runs, newest first. */
  recentRunStatuses: string[]
}

export interface ApiWorkspaceRun extends RunSummary {
  workflowName: string
  kind: 'workflow' | 'script'
}

export interface ApiRunPage {
  data: ApiWorkspaceRun[]
  nextCursor: string | null
  counts: { all: number; succeeded: number; failed: number; running: number }
}

export interface ApiFailing {
  workflow: { id: string; name: string; kind: 'workflow' | 'script' }
  project: { slug: string; name: string }
  workspace: { slug: string; name: string; colour: WorkspaceColour }
  run: RunSummary
}

export interface ApiRunFilter {
  result?: 'succeeded' | 'failed' | 'running'
  period?: '24h' | '7d' | '30d'
  search?: string
  cursor?: string
  limit?: number
}

interface ProjectSlugs {
  org: string
  project: string
}

interface WorkspaceSlugs extends ProjectSlugs {
  workspace: string
}

function query(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** A marketplace node as `GET /marketplace` lists it (B9), installed or not. */
export interface ApiMarketplaceNode {
  id: string
  name: string
  description: string
  category: string
  author: string
  latest: string
  installed: boolean
  installedVersion: string | null
  /** Workflows using it in their current version; null when not installed. */
  usage: number | null
  /** False for an installed node the registry no longer lists: it can only be removed. */
  inRegistry: boolean
}

/** Where a connection is used, as `POST`/`PATCH /connections` take it. */
export interface ApiConnectionProjects {
  allProjects?: boolean
  projectIds?: string[]
}

/** A key as `/api-keys` lists it (B3): its level, grid and where it reaches; never the secret. */
export interface ApiKeyRow {
  id: string
  level: KeyLevel
  name: string
  keyPrefix: string
  keySuffix: string | null
  permissions: KeyPermissions
  createdBy: string
  createdByName: string | null
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  projectId: string | null
  workspaceId: string | null
  workspace: { id: string; slug: string; name: string; colour: string } | null
}

/** One page of a level's key list; `nextCursor` until the last. */
export interface ApiKeyPage {
  data: ApiKeyRow[]
  nextCursor: string | null
}

export interface ApiProjectKeys extends ApiKeyPage {
  workspaceCounts: {
    workspace: { id: string; slug: string; name: string; colour: string }
    count: number
  }[]
}

export interface ApiWorkspaceKeys {
  own: ApiKeyRow[]
  inherited: ApiKeyRow[]
}

/** A variable as `/env-vars` lists it (B4): its level read off its columns, a secret's value masked. */
export interface ApiVariableRow {
  id: string
  level: ScopeLevel
  organizationId: string
  projectId: string | null
  workspaceId: string | null
  name: string
  value: string
  isSecret: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** An org-wide row with how many projects the viewer can open set the name themselves. */
export interface ApiOrgVariableRow extends ApiVariableRow {
  overriddenIn: number
}

export interface ApiVariableSource {
  level: ScopeLevel
  id: string
  name: string | null
}

/** `/env-vars/resolved` at a project: each name once, the project's value over the org's. */
export interface ApiResolvedProjectVariable extends ApiVariableRow {
  setAt: ApiVariableSource
  overriddenIn: { id: string; slug: string; name: string; colour: string }[]
}

/** `/env-vars/resolved` at a workspace: each name once, the closest level winning. */
export interface ApiResolvedWorkspaceVariable extends ApiVariableRow {
  source: ApiVariableSource
  overrides: 'project' | 'organization' | null
}

export interface ApiVariablePage {
  data: ApiVariableRow[]
  nextCursor: string | null
}

export interface ApiOrgVariablePage {
  data: ApiOrgVariableRow[]
  nextCursor: string | null
}

/** Where a key call is addressed: the level's slugs. */
export interface KeySlugs {
  org: string
  project?: string
  workspace?: string
}

export const dashboardApi = {
  getScope(slugs: { org: string; project?: string; workspace?: string }): Promise<ApiScope> {
    return request(`/scope${query(slugs)}`)
  },

  listOrgs(): Promise<{ data: ApiOrg[] }> {
    return request('/orgs')
  },

  listFailing(org: string): Promise<{ data: ApiFailing[] }> {
    return request(`/failing${query({ org })}`)
  },

  listProjects(
    org: string,
    page?: { cursor?: string; limit?: number },
  ): Promise<PaginatedResponse<ApiProject>> {
    return request(`/projects${query({ org, ...page })}`)
  },

  createProject(
    org: string,
    data: { name: string; slug: string; description?: string },
  ): Promise<ApiProjectRow & { defaultWorkspace: ApiWorkspaceRow }> {
    return request(`/projects${query({ org })}`, { method: 'POST', body: JSON.stringify(data) })
  },

  updateProject(
    org: string,
    id: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<ApiProjectRow> {
    return request(`/projects/${id}${query({ org })}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  deleteProject(org: string, id: string): Promise<{ ok: true }> {
    return request(`/projects/${id}${query({ org })}`, { method: 'DELETE' })
  },

  setProjectLock(org: string, id: string, locked: boolean): Promise<{ lock: ApiLock | null }> {
    return request(`/projects/${id}/lock${query({ org })}`, {
      method: 'PUT',
      body: JSON.stringify({ locked }),
    })
  },

  listWorkspaces(slugs: ProjectSlugs): Promise<{ data: ApiWorkspace[] }> {
    return request(`/workspaces${query(slugs)}`)
  },

  createWorkspace(
    slugs: ProjectSlugs,
    data: {
      name: string
      slug?: string
      colour?: WorkspaceColour
      description?: string
      members?: { userId: string; role: WorkspaceRole }[]
    },
  ): Promise<ApiWorkspaceRow> {
    return request(`/workspaces${query(slugs)}`, { method: 'POST', body: JSON.stringify(data) })
  },

  moveProject(id: string, organizationId: string): Promise<{ ok: true }> {
    return request(`/projects/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    })
  },

  // People and access (session only)
  listOrgMembers(org: string): Promise<{ data: ApiOrgMember[] }> {
    return request(`/members${query({ org })}`)
  },

  listProjectMembers(slugs: ProjectSlugs): Promise<ApiProjectMembers> {
    return request(`/members${query(slugs)}`)
  },

  getPersonAccess(org: string, userId: string): Promise<ApiPersonAccess> {
    return request(`/members/${userId}/access${query({ org })}`)
  },

  saveAccess(org: string, userId: string, grant: ApiAccessGrant): Promise<{ ok: true }> {
    return request(`/members/${userId}/access${query({ org })}`, {
      method: 'PUT',
      body: JSON.stringify(grant),
    })
  },

  removeFromOrg(org: string, userId: string): Promise<{ ok: true }> {
    return request(`/members/${userId}${query({ org })}`, { method: 'DELETE' })
  },

  listWorkspacePeople(workspaceId: string): Promise<{ data: ApiWorkspacePerson[] }> {
    return request(`/workspaces/${workspaceId}/members`)
  },

  addWorkspaceMember(
    workspaceId: string,
    data: { userId: string; role: WorkspaceRole },
  ): Promise<unknown> {
    return request(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  setWorkspaceRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<unknown> {
    return request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  removeWorkspaceMember(workspaceId: string, userId: string): Promise<{ ok: true }> {
    return request(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' })
  },

  // Invitations (session only)
  listInvitations(org: string): Promise<{ data: ApiInvitation[] }> {
    return request(`/invitations${query({ org })}`)
  },

  sendInvites(
    org: string,
    data: {
      emails: string[]
      role: 'member' | 'admin'
      places: { projectId: string; workspaceId: string | null; role: ProjectRole | WorkspaceRole }[]
    },
  ): Promise<{ data: { id: string; email: string }[] }> {
    return request(`/invitations${query({ org })}`, { method: 'POST', body: JSON.stringify(data) })
  },

  resendInvite(org: string, id: string): Promise<{ ok: true; expiresAt: string }> {
    return request(`/invitations/${id}/resend${query({ org })}`, { method: 'POST' })
  },

  cancelInvite(org: string, id: string): Promise<{ ok: true }> {
    return request(`/invitations/${id}${query({ org })}`, { method: 'DELETE' })
  },

  listOrgKeys(org: string, cursor?: string): Promise<ApiKeyPage> {
    return request(`/api-keys${query({ org, cursor })}`)
  },

  listProjectKeys(slugs: ProjectSlugs, cursor?: string): Promise<ApiProjectKeys> {
    return request(`/api-keys${query({ ...slugs, cursor })}`)
  },

  listWorkspaceKeys(slugs: WorkspaceSlugs): Promise<ApiWorkspaceKeys> {
    return request(`/api-keys${query(slugs)}`)
  },

  /** The secret comes back once, as `key`. */
  createKey(
    slugs: KeySlugs,
    data: { name: string; level: KeyLevel; permissions: KeyPermissions; expiresAt: string | null },
  ): Promise<ApiKeyRow & { key: string }> {
    return request(`/api-keys${query(slugs)}`, { method: 'POST', body: JSON.stringify(data) })
  },

  revokeKey(slugs: KeySlugs, id: string): Promise<ApiKeyRow> {
    return request(`/api-keys/${id}${query(slugs)}`, { method: 'DELETE' })
  },

  // Variables (B4), addressed at their level like keys: `?org=` the
  // organization's own, `&project=` a project's own, `&workspace=` a
  // workspace's own; the resolved reads give a project's or a workspace's view.
  listOrgVariables(org: string, cursor?: string): Promise<ApiOrgVariablePage> {
    return request(`/env-vars${query({ org, cursor })}`)
  },

  listResolvedProjectVariables(
    slugs: ProjectSlugs,
  ): Promise<{ data: ApiResolvedProjectVariable[] }> {
    return request(`/env-vars/resolved${query(slugs)}`)
  },

  listResolvedWorkspaceVariables(
    slugs: WorkspaceSlugs,
  ): Promise<{ data: ApiResolvedWorkspaceVariable[] }> {
    return request(`/env-vars/resolved${query(slugs)}`)
  },

  createVariable(
    slugs: KeySlugs,
    data: { name: string; value: string; isSecret: boolean },
  ): Promise<ApiVariableRow> {
    return request(`/env-vars${query(slugs)}`, { method: 'POST', body: JSON.stringify(data) })
  },

  /** `value` left out keeps a secret's stored value. */
  updateVariable(
    slugs: KeySlugs,
    id: string,
    data: { value?: string; isSecret: boolean },
  ): Promise<ApiVariableRow> {
    return request(`/env-vars/${id}${query(slugs)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  deleteVariable(slugs: KeySlugs, id: string): Promise<{ ok: true }> {
    return request(`/env-vars/${id}${query(slugs)}`, { method: 'DELETE' })
  },

  // Connections and the marketplace (B9): organization settings, `?org=`.
  listConnections(org: string, cursor?: string): Promise<PaginatedResponse<ConnectionSummary>> {
    return request(`/connections${query({ org, cursor })}`)
  },

  /** Checks the token with Cloudflare first: a refusal is a `400` on `token` or `accountId`. */
  createConnection(
    org: string,
    data: { name: string; accountId: string; apiToken: string } & ApiConnectionProjects,
  ): Promise<ConnectionSummary> {
    const { accountId, apiToken, ...rest } = data
    return request(`/connections${query({ org })}`, {
      method: 'POST',
      body: JSON.stringify({
        provider: 'cloudflare',
        credentials: { accountId, apiToken },
        ...rest,
      }),
    })
  },

  /** `apiToken` replaces the token and keeps the account, checked as on create. */
  updateConnection(
    org: string,
    id: string,
    data: { name?: string; apiToken?: string } & ApiConnectionProjects,
  ): Promise<ConnectionSummary> {
    const { apiToken, ...rest } = data
    return request(`/connections/${id}${query({ org })}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...rest,
        ...(apiToken !== undefined && { credentials: { apiToken } }),
      }),
    })
  },

  deleteConnection(org: string, id: string): Promise<{ ok: true }> {
    return request(`/connections/${id}${query({ org })}`, { method: 'DELETE' })
  },

  listMarketplace(org: string): Promise<{ nodes: ApiMarketplaceNode[] }> {
    return request(`/marketplace${query({ org })}`)
  },

  changeNode(
    org: string,
    change: 'install' | 'uninstall' | 'update',
    nodeId: string,
  ): Promise<unknown> {
    return request(`/marketplace/${change}${query({ org })}`, {
      method: 'POST',
      body: JSON.stringify({ nodeId }),
    })
  },

  /** The empty-project page's counts, by the project's id (B9). */
  getProjectSetup(org: string, projectId: string): Promise<ProjectSetup> {
    return request(`/projects/${projectId}/setup${query({ org })}`)
  },

  getInvite(token: string): Promise<ApiInviteView> {
    return request(`/invitations/${encodeURIComponent(token)}`)
  },

  acceptInvite(token: string): Promise<{ org: string; project?: string; workspace?: string }> {
    return request(`/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' })
  },

  answerInvite(
    token: string,
    action: 'decline' | 'undo-decline' | 'ask-again',
  ): Promise<{ ok: true }> {
    return request(`/invitations/${encodeURIComponent(token)}/${action}`, { method: 'POST' })
  },

  listMyInvites(): Promise<{ data: ApiPendingInvite[] }> {
    return request('/me/invitations')
  },

  // A Viewer's edit-access request (session only)
  getEditRequest(workspaceId: string): Promise<ApiAccessRequest | null> {
    return request(`/workspaces/${workspaceId}/access-request`)
  },

  requestEditAccess(workspaceId: string): Promise<ApiAccessRequest> {
    return request(`/workspaces/${workspaceId}/access-requests`, { method: 'POST' })
  },

  updateWorkspace(
    id: string,
    data: { name?: string; slug?: string; description?: string | null; colour?: WorkspaceColour },
  ): Promise<ApiWorkspaceRow> {
    return request(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteWorkspace(id: string): Promise<{ ok: true }> {
    return request(`/workspaces/${id}`, { method: 'DELETE' })
  },

  setWorkspaceLock(id: string, locked: boolean): Promise<{ lock: ApiLock | null }> {
    return request(`/workspaces/${id}/lock`, { method: 'PUT', body: JSON.stringify({ locked }) })
  },

  moveWorkflows(
    id: string,
    data: { workflowIds: string[]; targetWorkspaceId: string },
  ): Promise<{ moved: string[] }> {
    return request(`/workspaces/${id}/move-workflows`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  listWorkflows(
    slugs: WorkspaceSlugs,
    filter: { kind?: 'workflow' | 'script'; cursor?: string; limit?: number },
  ): Promise<PaginatedResponse<ApiWorkflowRow>> {
    return request(`/workflows${query({ ...slugs, ...filter })}`)
  },

  setWorkflowShared(
    slugs: WorkspaceSlugs,
    id: string,
    shared: boolean,
  ): Promise<{ sharing: ApiSharing | null }> {
    return request(`/workflows/${id}/share${query(slugs)}`, {
      method: 'PUT',
      body: JSON.stringify({ shared }),
    })
  },

  listProjectShared(
    org: string,
    projectId: string,
    filter: { cursor?: string; limit?: number } = {},
  ): Promise<PaginatedResponse<ApiSharedItem>> {
    return request(`/projects/${projectId}/shared${query({ org, ...filter })}`)
  },

  /** `GET /audit-events`: one page of the organization's log, newest first (B7). */
  listAuditEvents(org: string, filter: AuditFilter = {}): Promise<AuditPage> {
    return request(`/audit-events${query({ org, ...filter })}`)
  },

  /** `GET /notifications`: the person's Inbox in the org, newest first, with its counts (B8). */
  listNotifications(org: string): Promise<InboxPage> {
    return request(`/notifications${query({ org })}`)
  },

  markNotificationRead(org: string, id: string): Promise<{ ok: true }> {
    return request(`/notifications/${encodeURIComponent(id)}/read${query({ org })}`, {
      method: 'POST',
    })
  },

  markAllNotificationsRead(org: string): Promise<{ updated: number }> {
    return request(`/notifications/read-all${query({ org })}`, { method: 'POST' })
  },

  /** Approve or decline an edit-access request, by the request's id (B2). */
  decideAccessRequest(
    id: string,
    decision: 'approve' | 'decline',
  ): Promise<{ ok: true; alreadyEditing: boolean }> {
    return request(`/access-requests/${encodeURIComponent(id)}/${decision}`, { method: 'POST' })
  },

  /** When the person last closed What's new (B8). */
  getReleaseVisit(): Promise<ReleaseVisit> {
    return request('/releases/visit')
  },

  /** Closing What's new: the ids of the notes it showed. */
  recordReleaseVisit(seen: string[]): Promise<ReleaseVisit> {
    return request('/releases/visit', { method: 'PUT', body: JSON.stringify({ seen }) })
  },

  listSharedWith(
    workspaceId: string,
    filter: { kind?: 'workflow' | 'script'; cursor?: string; limit?: number },
  ): Promise<PaginatedResponse<ApiSharedItem>> {
    return request(`/workspaces/${workspaceId}/shared${query(filter)}`)
  },

  /** Answers with the row as stored: none of the status fields a listing carries. */
  createWorkflow(
    slugs: WorkspaceSlugs,
    data: { name: string; kind?: 'workflow' | 'script' },
  ): Promise<WorkflowSummary & { workspaceId: string }> {
    return request(`/workflows${query(slugs)}`, { method: 'POST', body: JSON.stringify(data) })
  },

  listRuns(slugs: WorkspaceSlugs, filter: ApiRunFilter): Promise<ApiRunPage> {
    return request(`/runs${query({ ...slugs, ...filter })}`)
  },
}
