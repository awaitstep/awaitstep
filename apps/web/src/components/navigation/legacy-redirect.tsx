import { Navigate } from '@tanstack/react-router'
import { useOrgStore } from '../../stores/org-store'
import {
  accountPath,
  dashboardPath,
  orgPath,
  orgSettingsPath,
  projectPath,
  withNewDialog,
  workspacePath,
  type AccountPage,
  type OrgSettingsPage,
  type WorkspacePage,
} from '../../lib/dashboard-paths'
import { recentOrgs, recentProjects, recentWorkspaces } from './scope-memory'

/** An old org-wide page (`/connections`): its Org Settings page, its "New …" dialog open when asked. */
export interface LegacySettingsPage {
  settings: OrgSettingsPage
  newDialog?: 'connection'
}

/** The old `/account` page: Your account, the same in every org (B10). */
export interface LegacyAccountPage {
  account: AccountPage
}

/** What replaced an old page: a workspace page, an Org Settings or account page, or (null) the org home. */
export type LegacyPage = WorkspacePage | LegacySettingsPage | LegacyAccountPage | null

/**
 * Where an old URL (`/workflows`, `/runs`, `/connections`, `/account`) now goes: the
 * organization opened last that the session can still open (else the
 * active one), its most recent project and workspace, on the page that
 * replaced the old one. With nothing remembered, the org home; with no org
 * at all, /dashboard. Rendered on the client only: the memory is
 * in localStorage, and it also remembers dummy visits and other accounts'
 * orgs, which is why it is checked against the session's.
 */
export function legacyTarget(
  page: LegacyPage,
  memory: {
    orgs: string[]
    projectsIn: (org: string) => string[]
    workspacesIn: (org: string, project: string) => string[]
  },
  sessionOrgs: readonly string[],
  fallbackOrg: string | null,
): string {
  const org = memory.orgs.find((slug) => sessionOrgs.includes(slug)) ?? fallbackOrg
  if (!org) return dashboardPath()
  if (page !== null && typeof page === 'object' && 'account' in page) {
    return accountPath(org, page.account)
  }
  if (page !== null && typeof page === 'object') {
    const path = orgSettingsPath(org, page.settings)
    return page.newDialog ? withNewDialog(path, page.newDialog) : path
  }
  const project = memory.projectsIn(org)[0]
  if (!project || !page) return orgPath(org)
  const workspace = memory.workspacesIn(org, project)[0]
  if (!workspace) return projectPath({ org, project })
  return workspacePath({ org, project, workspace }, page)
}

export function LegacyRedirect({ page }: { page: LegacyPage }) {
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
