import type { AccessDraft, AccessGrant, AccessProject } from '../../../types/dashboard/access'
import type { ProjectRole } from '../../../types/dashboard/projects'
import type { OrgRole } from '../../../types/dashboard/session'
import type { WorkspaceRole } from '../../../types/dashboard/workspaces'

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  member: 'Member',
  admin: 'Admin',
  owner: 'Owner',
}

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  member: 'Project member',
  admin: 'Project admin',
}

export const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Workspace admin',
}

export function orgRoleHint(role: OrgRole, orgName: string): string {
  switch (role) {
    case 'member':
      return 'Sees only the projects and workspaces given below'
    case 'admin':
      return 'Sees every project, and manages members, connections and resources'
    case 'owner':
      return `Everything an admin can do, plus billing and deleting ${orgName}`
  }
}

/** Org owners and admins open every project and workspace; members only what they're given. */
export function isOrgWide(draft: AccessDraft): boolean {
  return draft.orgRole !== 'member'
}

/** The project role that covers this project's workspaces, if any. */
export function coveringRole(draft: AccessDraft, projectId: string): ProjectRole | null {
  return draft.projects[projectId] ?? null
}

/** The "<Name> can work in" chips under the editor. */
export function describeAccess(
  draft: AccessDraft,
  projects: AccessProject[],
  orgName: string,
): string[] {
  if (isOrgWide(draft)) return [`Every project and workspace in ${orgName}`]
  const places = projects.flatMap((project) => {
    const projectRole = coveringRole(draft, project.id)
    if (projectRole) {
      return [`${project.name} · all workspaces (${PROJECT_ROLE_LABEL[projectRole]})`]
    }
    return project.workspaces.flatMap((workspace) => {
      const role = draft.workspaces[workspace.id]
      return role ? [`${project.name} · ${workspace.name} (${WORKSPACE_ROLE_LABEL[role]})`] : []
    })
  })
  return places.length > 0 ? places : ['Nothing yet. Pick a project or workspace above']
}

/** What a save sends: org-wide roles carry no picks, and covered workspace roles are dropped. */
export function toAccessGrant(draft: AccessDraft, projects: AccessProject[]): AccessGrant {
  const grant: AccessGrant = { orgRole: draft.orgRole, projects: [], workspaces: [] }
  if (isOrgWide(draft)) return grant
  for (const project of projects) {
    const projectRole = coveringRole(draft, project.id)
    if (projectRole) {
      grant.projects.push({ projectId: project.id, role: projectRole })
      continue
    }
    for (const workspace of project.workspaces) {
      const role = draft.workspaces[workspace.id]
      if (role) grant.workspaces.push({ workspaceId: workspace.id, role })
    }
  }
  return grant
}
