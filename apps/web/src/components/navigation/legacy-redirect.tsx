import { Navigate } from '@tanstack/react-router'
import { useOrgStore } from '../../stores/org-store'
import {
  chooseOrgPath,
  orgPath,
  projectPath,
  workspacePath,
  type WorkspacePage,
} from '../../lib/dashboard-paths'
import { recentOrgs, recentProjects, recentWorkspaces } from './scope-memory'

/**
 * Where an old URL (`/dashboard`, `/workflows`, `/runs`) now goes: the
 * organization opened last that the session can still open (else the
 * active one), its most recent project and workspace, on the page that
 * replaced the old one. With nothing remembered, the org home; with no org
 * at all, Choose an organization. Rendered on the client only: the memory is
 * in localStorage, and it also remembers dummy visits and other accounts'
 * orgs, which is why it is checked against the session's.
 */
export function legacyTarget(
  page: WorkspacePage | null,
  memory: {
    orgs: string[]
    projectsIn: (org: string) => string[]
    workspacesIn: (org: string, project: string) => string[]
  },
  sessionOrgs: readonly string[],
  fallbackOrg: string | null,
): string {
  const org = memory.orgs.find((slug) => sessionOrgs.includes(slug)) ?? fallbackOrg
  if (!org) return chooseOrgPath()
  const project = memory.projectsIn(org)[0]
  if (!project || !page) return orgPath(org)
  const workspace = memory.workspacesIn(org, project)[0]
  if (!workspace) return projectPath({ org, project })
  return workspacePath({ org, project, workspace }, page)
}

export function LegacyRedirect({ page }: { page: WorkspacePage | null }) {
  const organizations = useOrgStore((s) => s.organizations)
  const activeOrganizationId = useOrgStore((s) => s.activeOrganizationId)
  const activeOrg = organizations.find((o) => o.id === activeOrganizationId)
  const to = legacyTarget(
    page,
    { orgs: recentOrgs(), projectsIn: recentProjects, workspacesIn: recentWorkspaces },
    organizations.map((o) => o.slug),
    activeOrg?.slug ?? null,
  )
  return <Navigate to={to} replace />
}
