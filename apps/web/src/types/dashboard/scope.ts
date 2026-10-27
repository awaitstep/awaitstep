import type { Project, ProjectRole } from './projects'
import type { OrgRole, OrgSummary } from './session'
import type { Workspace, WorkspaceRole } from './workspaces'

/** Whether the viewer may do something here, and why not when they may not. */
export interface Allowed {
  allowed: boolean
  reason?: string
}

export type OrgCapability = 'createProject' | 'manageSettings' | 'delete'

export type ProjectCapability =
  | 'manageSettings'
  | 'createWorkspace'
  | 'manageMembers'
  | 'manageKeys'
  | 'manageVariables'
  | 'toggleLock'
  | 'delete'
  /** Move the project to another org: the org's owners and admins only. */
  | 'move'

export type WorkspaceCapability =
  | 'edit'
  | 'deploy'
  | 'run'
  | 'share'
  | 'manageSettings'
  | 'manageMembers'
  | 'manageKeys'
  | 'manageVariables'
  | 'toggleLock'
  | 'delete'

export type Capabilities<C extends string> = Record<C, Allowed>

export interface OrgScope {
  org: OrgSummary
  viewerRole: OrgRole
  viewerCan: Capabilities<OrgCapability>
}

export interface ProjectScope {
  project: Project
  /** Effective role: org owners and admins count as project admins. */
  viewerRole: ProjectRole | null
  viewerCan: Capabilities<ProjectCapability>
}

export interface WorkspaceScope {
  workspace: Workspace
  /** Effective role, after the org and project roles that cover it. */
  viewerRole: WorkspaceRole
  viewerCan: Capabilities<WorkspaceCapability>
}

/**
 * What a URL's slugs name. Missing and hidden scopes give the same result,
 * so a page can't tell a workspace exists when the viewer can't open it.
 */
export interface NotFound {
  kind: 'organization' | 'project' | 'workspace'
  slug: string
  parent: { name: string; slug: string } | null
}

export type ScopeLookup =
  | { found: true; org: OrgScope; project?: ProjectScope; workspace?: WorkspaceScope }
  | { found: false; notFound: NotFound }

/** The slugs a dashboard URL carries: `/acme/project-101/sales`. */
export interface ScopeSlugs {
  org: string
  project?: string
  workspace?: string
}

/**
 * A level something is set at, by slug: the org, a project in it, or a
 * workspace in that. Keys and variables are both scoped this way.
 */
export interface LevelSlugs {
  level: 'organization' | 'project' | 'workspace'
  project?: string
  workspace?: string
}
