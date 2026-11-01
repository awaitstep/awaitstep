import type {
  AccountPage,
  OrgPage,
  OrgSettingsPage,
  ProjectPage,
  WorkspacePage,
} from '../../lib/dashboard-paths'

/** Which dashboard page a route is. Each page route declares it in `staticData`. */
export type DashboardPage =
  | { kind: 'org'; page: OrgPage }
  | { kind: 'org-settings'; page: OrgSettingsPage }
  /** `/{org}/{project}/{page}`: Workspaces (the welcome while it's new), Members, Settings… */
  | { kind: 'project'; page: ProjectPage }
  | { kind: 'workspace'; page: WorkspacePage }
  | { kind: 'account'; page: AccountPage }
  /** A workflow, function or run of sample data (W1 placeholder until B1). */
  | { kind: 'item' }

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    dashboardPage?: DashboardPage
  }
}

const ORG_PAGE_LABEL: Record<OrgPage, string> = {
  projects: 'Projects',
  resources: 'Resources',
  audit: 'Audit log',
  connections: 'Connections',
  // The rail and the breadcrumb say "API" (board `KeysPage`, org level).
  'api-keys': 'API',
  inbox: 'Inbox',
  'whats-new': 'What’s new',
}

const ORG_SETTINGS_LABEL: Record<OrgSettingsPage, string> = {
  general: 'General',
  members: 'Members',
}

const PROJECT_PAGE_LABEL: Record<ProjectPage, string> = {
  workspaces: 'Workspaces',
  shared: 'Shared library',
  members: 'Members',
  'api-keys': 'API keys',
  variables: 'Variables',
  settings: 'Settings',
}

const WORKSPACE_PAGE_LABEL: Record<WorkspacePage, string> = {
  overview: 'Overview',
  workflows: 'Workflows',
  functions: 'Functions',
  library: 'Library',
  runs: 'Runs',
  settings: 'Workspace settings',
}

const ACCOUNT_PAGE_LABEL: Record<AccountPage, string> = {
  profile: 'Profile',
  sessions: 'Sessions and sign-in',
}

export function pageLabel(page: DashboardPage): string {
  switch (page.kind) {
    case 'org':
      return ORG_PAGE_LABEL[page.page]
    case 'org-settings':
      return ORG_SETTINGS_LABEL[page.page]
    case 'project':
      return PROJECT_PAGE_LABEL[page.page]
    case 'workspace':
      return WORKSPACE_PAGE_LABEL[page.page]
    case 'account':
      return ACCOUNT_PAGE_LABEL[page.page]
    case 'item':
      return 'Sample item'
  }
}

/** The document title: "Workflows · AwaitStep". */
export function pageTitle(page: DashboardPage): string {
  return `${pageLabel(page)} · AwaitStep`
}

/** `head` for a dashboard route. */
export function pageHead(page: DashboardPage) {
  return { meta: [{ title: pageTitle(page) }] }
}
