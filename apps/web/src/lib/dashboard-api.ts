import type {
  Allowed,
  OrgCapability,
  OrgRole,
  ProjectCapability,
  ProjectRole,
  WorkspaceCapability,
  WorkspaceColour,
  WorkspaceRole,
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
  members: ApiMember[]
  viewerRole: ProjectRole
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
    runs24h: number
    failing: number
    lastRunAt: string | null
  }
  members: ApiMember[]
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

export interface ApiWorkflowRow extends WorkflowSummary {
  workspaceId: string
  deployedVersion: number | null
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

  listWorkspaces(slugs: ProjectSlugs): Promise<{ data: ApiWorkspace[] }> {
    return request(`/workspaces${query(slugs)}`)
  },

  createWorkspace(
    slugs: ProjectSlugs,
    data: { name: string; slug?: string; colour?: WorkspaceColour; description?: string },
  ): Promise<ApiWorkspaceRow> {
    return request(`/workspaces${query(slugs)}`, { method: 'POST', body: JSON.stringify(data) })
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
