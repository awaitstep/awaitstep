import {
  orgCapabilities,
  projectCapabilities,
  workspaceCapabilities,
  type OrgRole,
  type ProjectRole,
  type WorkspaceRole,
} from '@awaitstep/ir'
import type { FakeApi } from './fake-api'

/**
 * Makes `GET /scope` answer the workspace at `key` (`org/project/workspace`)
 * for someone with `role` there, with the capabilities the API's own rules
 * (`workspaceCapabilities`) give that role. The base data is Ama's (an owner).
 */
export function asWorkspaceRole(api: FakeApi, key: string, role: WorkspaceRole): void {
  const workspace = api.data.workspaces[key]
  if (!workspace) throw new Error(`Fake API: no workspace ${key}`)
  const projectKey = key.split('/').slice(0, 2).join('/')
  const project = api.data.projects[projectKey]
  workspace.viewerRole = role
  workspace.viewerCan = workspaceCapabilities(role, {
    ownLock: workspace.lock !== null,
    lockedByProject: project?.lock ? project.name : null,
    isLastWorkspace: (project?.workspaces.length ?? 0) <= 1,
    sharedInUse: false,
  })
}

/**
 * Makes `GET /scope` answer the project at `key` (`org/project`) for someone
 * with `role` there (and `orgRole` in its org), with the API's own capability rules.
 */
export function asProjectRole(
  api: FakeApi,
  key: string,
  role: ProjectRole | null,
  orgRole: OrgRole = 'member',
): void {
  const project = api.data.projects[key]
  if (!project) throw new Error(`Fake API: no project ${key}`)
  project.viewerRole = role
  project.viewerCan = projectCapabilities(
    role,
    { ownLock: project.lock !== null, lockedWorkspaces: [] },
    orgRole,
  )
}

/** Makes `GET /scope` answer the org (`org` slug) for someone with `role` there. */
export function asOrgRole(api: FakeApi, org: string, role: OrgRole): void {
  const scope = api.data.orgs[org]
  if (!scope) throw new Error(`Fake API: no org ${org}`)
  scope.role = role
  scope.viewerCan = orgCapabilities(role, scope.projectCount)
}
