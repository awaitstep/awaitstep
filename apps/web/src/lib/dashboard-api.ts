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
  AvailableConnection,
  ProjectConnections,
  AccountExport,
  AccountSession,
  ApiAccount,
  RunHour,
} from '@awaitstep/ir'
import type { ProjectAccessChoice } from '../types/dashboard/access'
import {
  request,
  type PaginatedResponse,
  type RunSummary,
  type WorkflowSummary,
} from './api-client'
import { apiPath } from './api-path'

// The dashboard's calls, addressed by the slugs its URLs carry rather than
// by the org store: `GET /scope`, the workspace routes, and the project,
// workflow and run routes with their workspace filters.

export type ApiCapabilities<C extends string> = Record<C, Allowed>

/**
 * One address in a project's or workspace's invite reply: ids and expiry only for org owners
 * and admins (who manage invitations); anyone else gets the address alone, sent or already invited.
 */
export interface PlaceInviteReply {
  email: string
  id?: string
  expiresAt?: string
}

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
  place: ApiInviteDetails['place']
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

/** One org on the session's list (`GET /orgs`): its own grants and health beside the record. */
export interface ApiOrgListing extends ApiOrg {
  grants: {
    projects: { name: string; role: ProjectRole }[]
    workspaces: { name: string; projectName: string; role: WorkspaceRole }[]
  }
  health: { failing: number; lastRunAt: string | null }
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
  /** On the scope answer only: the last 24 hours' runs, oldest first. */
  runsByHour?: RunHour[]
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
  /** With `workflowId`: its last 24 hours, oldest first. */
  byHour?: RunHour[]
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
  /** One workflow's runs in the workspace. */
  workflowId?: string
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
  /** The registry's logo URL; absent for a node the registry no longer lists. */
  icon?: string
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
export interface ApiKeyProjectScope {
  projectId: string
  projectName: string | null
  projectSlug: string | null
  revokedAt: string | null
}

export interface ApiKeyWorkspaceScope {
  workspace: { id: string; slug: string; name: string; colour: string }
  revokedAt: string | null
}

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
  /** The project scope set (project-level keys); empty otherwise. */
  projects: ApiKeyProjectScope[]
  /** The workspace scope set (workspace-level keys); empty otherwise. */
  workspaces: ApiKeyWorkspaceScope[]
}

/** The organization's keys list; `nextCursor` until the last page. */
export interface ApiKeyPage {
  data: ApiKeyRow[]
  nextCursor: string | null
}

/** A project's keys page: its own keys, the keys reaching it, and a count per workspace. */
export interface ApiProjectKeys {
  own: ApiKeyRow[]
  reaching: ApiKeyRow[]
  workspaceCounts: {
    workspace: { id: string; slug: string; name: string; colour: string }
    count: number
  }[]
}

export interface ApiWorkspaceKeys {
  own: ApiKeyRow[]
  reaching: ApiKeyRow[]
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
  reach: ApiVariableReach
}

/** Where a project's or org's variable applies; `blocked` are the places with their own value. */
export interface ApiVariableReach {
  all: boolean
  places: { id: string; slug: string; name: string }[]
  blocked: string[]
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
  reach: ApiVariableReach | null
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

export type ApiVariableReachInput = { all: true } | { ids: string[] }

/** Where a key call is addressed: the level's slugs. */
export interface KeySlugs {
  org: string
  project?: string
  workspace?: string
}

export const dashboardApi = {
  getScope(slugs: { org: string; project?: string; workspace?: string }): Promise<ApiScope> {
    return request(apiPath`/scope` + query(slugs))
  },

  listOrgs(): Promise<{ data: ApiOrgListing[] }> {
    return request('/orgs')
  },

  listFailing(org: string): Promise<{ data: ApiFailing[] }> {
    return request(apiPath`/failing` + query({ org }))
  },

  listProjects(
    org: string,
    page?: { cursor?: string; limit?: number },
  ): Promise<PaginatedResponse<ApiProject>> {
    return request(apiPath`/projects` + query({ org, ...page }))
  },

  createProject(
    org: string,
    data: { name: string; slug: string; description?: string },
  ): Promise<ApiProjectRow & { defaultWorkspace: ApiWorkspaceRow }> {
    return request(apiPath`/projects` + query({ org }), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateProject(
    org: string,
    id: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<ApiProjectRow> {
    return request(apiPath`/projects/${id}` + query({ org }), {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  deleteProject(org: string, id: string): Promise<{ ok: true }> {
    return request(apiPath`/projects/${id}` + query({ org }), { method: 'DELETE' })
  },

  setProjectLock(org: string, id: string, locked: boolean): Promise<{ lock: ApiLock | null }> {
    return request(apiPath`/projects/${id}/lock` + query({ org }), {
      method: 'PUT',
      body: JSON.stringify({ locked }),
    })
  },

  listWorkspaces(slugs: ProjectSlugs): Promise<{ data: ApiWorkspace[] }> {
    return request(apiPath`/workspaces` + query(slugs))
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
    return request(apiPath`/workspaces` + query(slugs), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  moveProject(id: string, organizationId: string): Promise<{ ok: true }> {
    return request(apiPath`/projects/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    })
  },

  // People and access (session only)
  listOrgMembers(org: string): Promise<{ data: ApiOrgMember[] }> {
    return request(apiPath`/members` + query({ org }))
  },

  listProjectMembers(slugs: ProjectSlugs): Promise<ApiProjectMembers> {
    return request(apiPath`/members` + query(slugs))
  },

  getPersonAccess(org: string, userId: string): Promise<ApiPersonAccess> {
    return request(apiPath`/members/${userId}/access` + query({ org }))
  },

  saveAccess(org: string, userId: string, grant: ApiAccessGrant): Promise<{ ok: true }> {
    return request(apiPath`/members/${userId}/access` + query({ org }), {
      method: 'PUT',
      body: JSON.stringify(grant),
    })
  },

  removeFromOrg(org: string, userId: string): Promise<{ ok: true }> {
    return request(apiPath`/members/${userId}` + query({ org }), { method: 'DELETE' })
  },

  listWorkspacePeople(workspaceId: string): Promise<{ data: ApiWorkspacePerson[] }> {
    return request(apiPath`/workspaces/${workspaceId}/members`)
  },

  addWorkspaceMember(
    workspaceId: string,
    data: { userId: string; role: WorkspaceRole },
  ): Promise<unknown> {
    return request(apiPath`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** 21b: new addresses join the org as Members with a role in this workspace only. */
  inviteToWorkspace(
    workspaceId: string,
    data: { emails: string[]; role: WorkspaceRole },
  ): Promise<{ data: PlaceInviteReply[] }> {
    return request(apiPath`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** 21a: someone already in the org gets the whole project, or one role in some workspaces. */
  addToProject(
    projectId: string,
    data: { userId: string; access: ProjectAccessChoice },
  ): Promise<{
    userId: string
    scope: ProjectAccessChoice['scope']
    role: string
    /** The workspaces written (the workspaces scope): those asked for, less any already held. */
    workspaces?: { id: string; name: string }[]
  }> {
    return request(apiPath`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** 21a: new addresses join the org as Members with this project's access only. */
  inviteToProject(
    projectId: string,
    data: { emails: string[]; access: ProjectAccessChoice },
  ): Promise<{ data: PlaceInviteReply[] }> {
    return request(apiPath`/projects/${projectId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  setWorkspaceRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<unknown> {
    return request(apiPath`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  removeWorkspaceMember(workspaceId: string, userId: string): Promise<{ ok: true }> {
    return request(apiPath`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' })
  },

  // Invitations (session only)
  listInvitations(org: string): Promise<{ data: ApiInvitation[] }> {
    return request(apiPath`/invitations` + query({ org }))
  },

  sendInvites(
    org: string,
    data: {
      emails: string[]
      role: 'member' | 'admin'
      places: { projectId: string; workspaceId: string | null; role: ProjectRole | WorkspaceRole }[]
    },
  ): Promise<{ data: { id: string; email: string }[] }> {
    return request(apiPath`/invitations` + query({ org }), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  resendInvite(org: string, id: string): Promise<{ ok: true; expiresAt: string }> {
    return request(apiPath`/invitations/${id}/resend` + query({ org }), { method: 'POST' })
  },

  cancelInvite(org: string, id: string): Promise<{ ok: true }> {
    return request(apiPath`/invitations/${id}` + query({ org }), { method: 'DELETE' })
  },

  listOrgKeys(org: string, cursor?: string): Promise<ApiKeyPage> {
    return request(apiPath`/api-keys` + query({ org, cursor }))
  },

  listProjectKeys(slugs: ProjectSlugs): Promise<ApiProjectKeys> {
    return request(apiPath`/api-keys` + query(slugs))
  },

  listWorkspaceKeys(slugs: WorkspaceSlugs): Promise<ApiWorkspaceKeys> {
    return request(apiPath`/api-keys` + query(slugs))
  },

  /** The secret comes back once, as `key`. A project/workspace key may carry a scope set. */
  createKey(
    slugs: KeySlugs,
    data: {
      name: string
      level: KeyLevel
      permissions: KeyPermissions
      expiresAt: string | null
      projectIds?: string[]
      workspaceIds?: string[]
    },
  ): Promise<ApiKeyRow & { key: string }> {
    return request(apiPath`/api-keys` + query(slugs), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** The whole-key kill-switch, from the key's home level. */
  revokeKey(slugs: KeySlugs, id: string): Promise<ApiKeyRow> {
    return request(apiPath`/api-keys/${id}` + query(slugs), { method: 'DELETE' })
  },

  /** Per-consumer revoke: the addressed project or workspace drops its own slice of a shared key. */
  revokeKeyScope(slugs: KeySlugs, id: string): Promise<ApiKeyRow> {
    return request(apiPath`/api-keys/${id}/scope` + query(slugs), { method: 'DELETE' })
  },

  // Variables (B4), addressed at their level like keys: `?org=` the
  // organization's own, `&project=` a project's own, `&workspace=` a
  // workspace's own; the resolved reads give a project's or a workspace's view.
  listOrgVariables(org: string, cursor?: string): Promise<ApiOrgVariablePage> {
    return request(apiPath`/env-vars` + query({ org, cursor }))
  },

  listResolvedProjectVariables(
    slugs: ProjectSlugs,
  ): Promise<{ data: ApiResolvedProjectVariable[] }> {
    return request(apiPath`/env-vars/resolved` + query(slugs))
  },

  listResolvedWorkspaceVariables(
    slugs: WorkspaceSlugs,
  ): Promise<{ data: ApiResolvedWorkspaceVariable[] }> {
    return request(apiPath`/env-vars/resolved` + query(slugs))
  },

  createVariable(
    slugs: KeySlugs,
    data: { name: string; value: string; isSecret: boolean; reach?: ApiVariableReachInput },
  ): Promise<ApiVariableRow & { skipped: string[] }> {
    return request(apiPath`/env-vars` + query(slugs), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** `value` left out keeps a secret's stored value. */
  updateVariable(
    slugs: KeySlugs,
    id: string,
    data: { value?: string; isSecret: boolean; reach?: ApiVariableReachInput },
  ): Promise<ApiVariableRow & { skipped: string[] }> {
    return request(apiPath`/env-vars/${id}` + query(slugs), {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  deleteVariable(slugs: KeySlugs, id: string): Promise<{ ok: true }> {
    return request(apiPath`/env-vars/${id}` + query(slugs), { method: 'DELETE' })
  },

  // Connections and the marketplace (B9): organization settings, `?org=`.
  /** `project` (a slug) narrows the list to the accounts that deploy that project. */
  listConnections(
    org: string,
    cursor?: string,
    project?: string,
  ): Promise<PaginatedResponse<ConnectionSummary>> {
    return request(apiPath`/connections` + query({ org, cursor, project }))
  },

  /** Checks the token with Cloudflare first: a refusal is a `400` on `token` or `accountId`. */
  createConnection(
    org: string,
    data: { name: string; accountId: string; apiToken: string } & ApiConnectionProjects,
  ): Promise<ConnectionSummary> {
    const { accountId, apiToken, ...rest } = data
    return request(apiPath`/connections` + query({ org }), {
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
    return request(apiPath`/connections/${id}` + query({ org }), {
      method: 'PATCH',
      body: JSON.stringify({
        ...rest,
        ...(apiToken !== undefined && { credentials: { apiToken } }),
      }),
    })
  },

  deleteConnection(org: string, id: string): Promise<{ ok: true }> {
    return request(apiPath`/connections/${id}` + query({ org }), { method: 'DELETE' })
  },

  listMarketplace(org: string): Promise<{ nodes: ApiMarketplaceNode[] }> {
    return request(apiPath`/marketplace` + query({ org }))
  },

  changeNode(
    org: string,
    change: 'install' | 'uninstall' | 'update',
    nodeId: string,
  ): Promise<unknown> {
    return request(apiPath`/marketplace/${change}` + query({ org }), {
      method: 'POST',
      body: JSON.stringify({ nodeId }),
    })
  },

  // A project's accounts (23a–23c), by the project's id.
  listProjectConnections(org: string, projectId: string): Promise<ProjectConnections> {
    return request(apiPath`/projects/${projectId}/connections` + query({ org }))
  },

  listAvailableProjectConnections(
    org: string,
    projectId: string,
  ): Promise<{ data: AvailableConnection[] }> {
    return request(apiPath`/projects/${projectId}/connections/available` + query({ org }))
  },

  addProjectConnections(
    org: string,
    projectId: string,
    connectionIds: string[],
  ): Promise<{ added: { id: string; name: string }[]; defaultId: string | null }> {
    return request(apiPath`/projects/${projectId}/connections` + query({ org }), {
      method: 'POST',
      body: JSON.stringify({ connectionIds }),
    })
  },

  /** Checks the token with Cloudflare first: a refusal is a `400` on `token` or `accountId`. */
  createProjectConnection(
    org: string,
    projectId: string,
    data: { name: string; accountId: string; token: string; makeDefault: boolean },
  ): Promise<{ id: string; name: string; scope: 'shared' | 'project'; isDefault: boolean }> {
    return request(apiPath`/projects/${projectId}/connections/new` + query({ org }), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  replaceProjectConnectionToken(
    org: string,
    projectId: string,
    connectionId: string,
    token: string,
  ): Promise<unknown> {
    return request(apiPath`/projects/${projectId}/connections/${connectionId}` + query({ org }), {
      method: 'PATCH',
      body: JSON.stringify({ token }),
    })
  },

  removeProjectConnection(org: string, projectId: string, connectionId: string): Promise<unknown> {
    return request(apiPath`/projects/${projectId}/connections/${connectionId}` + query({ org }), {
      method: 'DELETE',
    })
  },

  setProjectDefaultConnection(
    org: string,
    projectId: string,
    connectionId: string,
  ): Promise<unknown> {
    return request(apiPath`/projects/${projectId}/default-connection` + query({ org }), {
      method: 'PUT',
      body: JSON.stringify({ connectionId }),
    })
  },

  setWorkspaceConnection(
    org: string,
    projectId: string,
    workspaceId: string,
    connectionId: string | null,
  ): Promise<unknown> {
    return request(
      apiPath`/projects/${projectId}/workspaces/${workspaceId}/connection` + query({ org }),
      {
        method: 'PUT',
        body: JSON.stringify({ connectionId }),
      },
    )
  },

  /** The empty-project page's counts, by the project's id (B9). */
  getProjectSetup(org: string, projectId: string): Promise<ProjectSetup> {
    return request(apiPath`/projects/${projectId}/setup` + query({ org }))
  },

  getInvite(token: string): Promise<ApiInviteView> {
    return request(apiPath`/invitations/${token}`)
  },

  acceptInvite(token: string): Promise<{ org: string; project?: string; workspace?: string }> {
    return request(apiPath`/invitations/${token}/accept`, { method: 'POST' })
  },

  answerInvite(
    token: string,
    action: 'decline' | 'undo-decline' | 'ask-again',
  ): Promise<{ ok: true }> {
    return request(apiPath`/invitations/${token}/${action}`, { method: 'POST' })
  },

  listMyInvites(): Promise<{ data: ApiPendingInvite[] }> {
    return request('/me/invitations')
  },

  // A Viewer's edit-access request (session only)
  getEditRequest(workspaceId: string): Promise<ApiAccessRequest | null> {
    return request(apiPath`/workspaces/${workspaceId}/access-request`)
  },

  requestEditAccess(workspaceId: string): Promise<ApiAccessRequest> {
    return request(apiPath`/workspaces/${workspaceId}/access-requests`, { method: 'POST' })
  },

  updateWorkspace(
    id: string,
    data: { name?: string; slug?: string; description?: string | null; colour?: WorkspaceColour },
  ): Promise<ApiWorkspaceRow> {
    return request(apiPath`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteWorkspace(id: string): Promise<{ ok: true }> {
    return request(apiPath`/workspaces/${id}`, { method: 'DELETE' })
  },

  setWorkspaceLock(id: string, locked: boolean): Promise<{ lock: ApiLock | null }> {
    return request(apiPath`/workspaces/${id}/lock`, {
      method: 'PUT',
      body: JSON.stringify({ locked }),
    })
  },

  moveWorkflows(
    id: string,
    data: { workflowIds: string[]; targetWorkspaceId: string },
  ): Promise<{ moved: string[] }> {
    return request(apiPath`/workspaces/${id}/move-workflows`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  listWorkflows(
    slugs: WorkspaceSlugs,
    filter: { kind?: 'workflow' | 'script'; cursor?: string; limit?: number },
  ): Promise<PaginatedResponse<ApiWorkflowRow>> {
    return request(apiPath`/workflows` + query({ ...slugs, ...filter }))
  },

  setWorkflowShared(
    slugs: WorkspaceSlugs,
    id: string,
    shared: boolean,
  ): Promise<{ sharing: ApiSharing | null }> {
    return request(apiPath`/workflows/${id}/share` + query(slugs), {
      method: 'PUT',
      body: JSON.stringify({ shared }),
    })
  },

  listProjectShared(
    org: string,
    projectId: string,
    filter: { cursor?: string; limit?: number } = {},
  ): Promise<PaginatedResponse<ApiSharedItem>> {
    return request(apiPath`/projects/${projectId}/shared` + query({ org, ...filter }))
  },

  /** `GET /audit-events`: one page of the organization's log, newest first (B7). */
  listAuditEvents(org: string, filter: AuditFilter = {}): Promise<AuditPage> {
    return request(apiPath`/audit-events` + query({ org, ...filter }))
  },

  /** `GET /notifications`: the person's Inbox in the org, newest first, with its counts (B8). */
  listNotifications(org: string): Promise<InboxPage> {
    return request(apiPath`/notifications` + query({ org }))
  },

  markNotificationRead(org: string, id: string): Promise<{ ok: true }> {
    return request(apiPath`/notifications/${id}/read` + query({ org }), {
      method: 'POST',
    })
  },

  markAllNotificationsRead(org: string): Promise<{ updated: number }> {
    return request(apiPath`/notifications/read-all` + query({ org }), { method: 'POST' })
  },

  /** Approve or decline an edit-access request, by the request's id (B2). */
  decideAccessRequest(
    id: string,
    decision: 'approve' | 'decline',
  ): Promise<{ ok: true; alreadyEditing: boolean }> {
    return request(apiPath`/access-requests/${id}/${decision}`, { method: 'POST' })
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
    return request(apiPath`/workspaces/${workspaceId}/shared` + query(filter))
  },

  /** Answers with the row as stored: none of the status fields a listing carries. */
  createWorkflow(
    slugs: WorkspaceSlugs,
    data: { name: string; description?: string; kind?: 'workflow' | 'script' },
  ): Promise<WorkflowSummary & { workspaceId: string }> {
    return request(apiPath`/workflows` + query(slugs), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** Saves `ir` as the workflow's next version, in the project the slugs name (import). */
  createVersion(slugs: ProjectSlugs, workflowId: string, ir: unknown): Promise<{ id: string }> {
    const { org, project } = slugs
    return request(apiPath`/workflows/${workflowId}/versions` + query({ org, project }), {
      method: 'POST',
      body: JSON.stringify({ ir }),
    })
  },

  deleteWorkflow(slugs: ProjectSlugs, workflowId: string): Promise<{ ok: true }> {
    const { org, project } = slugs
    return request(apiPath`/workflows/${workflowId}` + query({ org, project }), {
      method: 'DELETE',
    })
  },

  listRuns(slugs: WorkspaceSlugs, filter: ApiRunFilter): Promise<ApiRunPage> {
    return request(apiPath`/runs` + query({ ...slugs, ...filter }))
  },

  /** Your account (B10): the person, their orgs and their ways in — the same in every org. */
  getAccount(): Promise<ApiAccount> {
    return request('/account')
  },

  /** Their project and workspace roles there go too; the only owner gets a `409`. */
  leaveOrg(orgId: string): Promise<{ ok: true }> {
    return request(apiPath`/account/orgs/${orgId}/leave`, { method: 'POST' })
  },
  /** The photo as the request body (B10); answers its `/api/images/…` path. */
  uploadPhoto(image: Blob): Promise<{ image: string }> {
    return request('/account/photo', {
      method: 'PUT',
      body: image,
      headers: { 'Content-Type': image.type },
    })
  },
  removePhoto(): Promise<{ image: null }> {
    return request('/account/photo', { method: 'DELETE' })
  },
  /** The org's logo as the request body; owners and admins only. */
  uploadOrgLogo(orgId: string, logo: Blob): Promise<{ logo: string }> {
    return request(apiPath`/orgs/${orgId}/logo`, {
      method: 'PUT',
      body: logo,
      headers: { 'Content-Type': logo.type },
    })
  },
  removeOrgLogo(orgId: string): Promise<{ logo: null }> {
    return request(apiPath`/orgs/${orgId}/logo`, { method: 'DELETE' })
  },

  listAccountSessions(): Promise<{ data: AccountSession[] }> {
    return request('/account/sessions')
  },

  revokeAccountSession(sessionId: string): Promise<{ ok: true }> {
    return request(apiPath`/account/sessions/${sessionId}`, { method: 'DELETE' })
  },

  revokeOtherAccountSessions(): Promise<{ count: number }> {
    return request('/account/sessions?scope=others', { method: 'DELETE' })
  },

  exportAccount(): Promise<AccountExport> {
    return request('/account/export', { method: 'POST' })
  },
}
