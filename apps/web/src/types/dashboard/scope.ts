import type { Project, ProjectRole } from './projects'
import type { OrgRole, OrgSummary } from './session'
import type { Workspace, WorkspaceRole } from './workspaces'

// The capability vocabulary is @awaitstep/ir's, shared with the API and the dummy server.
export type {
  Allowed,
  Capabilities,
  OrgCapability,
  ProjectCapability,
  WorkspaceCapability,
} from '@awaitstep/ir'
import type {
  Capabilities,
  OrgCapability,
  ProjectCapability,
  WorkspaceCapability,
} from '@awaitstep/ir'

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
