import type { ScopeSlugs } from '../types/dashboard/scope'

// Every href in the new dashboard is built here, so the URL shape lives in one
// place: /{org}/{project}/{workspace}/{page}.

export const ORG_PAGES = [
  'projects',
  'resources',
  'audit',
  'connections',
  'api-keys',
  'inbox',
  'whats-new',
] as const
export type OrgPage = (typeof ORG_PAGES)[number]

/** Org Settings' sections, tabs on one page (boards `OrgGeneral`/`OrgMembers`), General first. */
export const ORG_SETTINGS_PAGES = ['general', 'members'] as const
export type OrgSettingsPage = (typeof ORG_SETTINGS_PAGES)[number]

/**
 * Where an org-wide link may point: a Settings section, or Connections and
 * API keys, which were Settings sections until they got their own rail items.
 * Inbox links and release notes name these; `orgDestinationPath` resolves them.
 */
export type OrgDestination = OrgSettingsPage | 'connections' | 'api-keys'

/** A project's pages, each straight under it: `/{org}/{project}/{page}`, as its menu lists them. */
export const PROJECT_PAGES = [
  'workspaces',
  'shared',
  'members',
  'connections',
  'api-keys',
  'variables',
  'settings',
] as const
export type ProjectPage = (typeof PROJECT_PAGES)[number]

export const WORKSPACE_PAGES = [
  'overview',
  'workflows',
  'functions',
  'library',
  'runs',
  'settings',
] as const
export type WorkspacePage = (typeof WORKSPACE_PAGES)[number]

export const ACCOUNT_PAGES = ['profile', 'sessions'] as const
export type AccountPage = (typeof ACCOUNT_PAGES)[number]

export type ProjectSlugs = Required<Pick<ScopeSlugs, 'org' | 'project'>>
export type WorkspaceSlugs = Required<ScopeSlugs>

/** Where a bare workspace URL goes, and where every workspace card and switcher links. */
export const DEFAULT_WORKSPACE_PAGE: WorkspacePage = 'overview'

// A URL segment at each level can't be a page a route already owns. The lists
// live in `@awaitstep/ir` so the API refuses the same slugs the router hides;
// `lib/__tests__/dashboard-paths.test.ts` checks every page name here is in them.
export { RESERVED_SLUGS, isReservedSlug } from '@awaitstep/ir'

function segment(slug: string): string {
  return encodeURIComponent(slug)
}

export function orgPath(org: string, page: OrgPage = 'projects'): string {
  return `/${segment(org)}/${page}`
}

/** Org Settings, on General (its first tab) unless another section is named. */
export function orgSettingsPath(org: string, page: OrgSettingsPage = 'general'): string {
  return `/${segment(org)}/settings/${page}`
}

export function orgDestinationPath(org: string, page: OrgDestination): string {
  return page === 'connections' || page === 'api-keys'
    ? orgPath(org, page)
    : orgSettingsPath(org, page)
}

/** A project's Members page with Add people open: the access editor, set to add someone to this project. */
export function projectMembersAddPath(slugs: ProjectSlugs): string {
  return `${projectPagePath(slugs, 'members')}?${new URLSearchParams({ access: 'add' })}`
}

/** The project URL itself, which goes on to its Workspaces page. */
export function projectPath(slugs: ProjectSlugs): string {
  return `/${segment(slugs.org)}/${segment(slugs.project)}`
}

/** One of the project's pages: `/{org}/{project}/members`, `/{org}/{project}/settings`. */
export function projectPagePath(slugs: ProjectSlugs, page: ProjectPage): string {
  return `${projectPath(slugs)}/${page}`
}

/** The project's own page: its workspaces and project pool, or the welcome while it's new. */
export function projectWorkspacesPath(slugs: ProjectSlugs): string {
  return projectPagePath(slugs, 'workspaces')
}

export function workspacePath(
  slugs: WorkspaceSlugs,
  page: WorkspacePage = DEFAULT_WORKSPACE_PAGE,
): string {
  return `${projectPath(slugs)}/${segment(slugs.workspace)}/${page}`
}

export const WORKSPACE_SETTINGS_TABS = ['members', 'keys', 'variables'] as const
export type WorkspaceSettingsTab = (typeof WORKSPACE_SETTINGS_TABS)[number]

/**
 * Workspace settings, on a tab (`?tab=`), or General without one; `dialog`
 * also opens that tab's "New …" dialog (P6 builds them).
 */
export function workspaceSettingsPath(
  slugs: WorkspaceSlugs,
  tab?: WorkspaceSettingsTab,
  dialog?: 'key' | 'variable',
): string {
  const query = new URLSearchParams({
    ...(tab && { tab }),
    ...(dialog && { new: dialog }),
  }).toString()
  const path = workspacePath(slugs, 'settings')
  return query ? `${path}?${query}` : path
}

/**
 * Your own account — top-level, not under an org: it's the same in every org,
 * so its URL carries none. The dashboard still frames it with the rail of your
 * current organization (see `useCurrentOrg`).
 */
export function accountPath(page: AccountPage = 'profile'): string {
  return `/account/${page}`
}

/**
 * The access editor on org Members (built in P5): one person's access, or
 * adding people to a project.
 */
export function accessEditorPath(
  org: string,
  target: { userId: string } | { addTo: string },
): string {
  const query =
    'userId' in target
      ? new URLSearchParams({ access: target.userId })
      : new URLSearchParams({ access: 'add', project: target.addTo })
  return `${orgSettingsPath(org, 'members')}?${query}`
}

/**
 * Variables with a dialog open: New variable, or one variable's (the page
 * opens Edit where it's set, Override where it's inherited). Resources'
 * Variables tab for the org, project settings for project slugs, the
 * workspace's Variables tab for workspace slugs.
 */
export function variableDialogPath(
  slugs: { org: string } | ProjectSlugs | WorkspaceSlugs,
  dialog: { kind: 'new' } | { kind: 'variable'; name: string },
): string {
  const query: Record<string, string> =
    dialog.kind === 'new' ? { new: 'variable' } : { variable: dialog.name }
  // Workspace settings and Resources hold variables on a tab.
  if ('workspace' in slugs) {
    return `${workspacePath(slugs, 'settings')}?${new URLSearchParams({ tab: 'variables', ...query })}`
  }
  if ('project' in slugs) {
    return `${projectPagePath(slugs, 'variables')}?${new URLSearchParams(query)}`
  }
  return `${orgPath(slugs.org, 'resources')}?${new URLSearchParams({ tab: 'variables', ...query })}`
}

export const DASHBOARD_OVERLAYS = ['inbox', 'whats-new'] as const
export type DashboardOverlay = (typeof DASHBOARD_OVERLAYS)[number]

/**
 * The page you're on (path and query) with the Inbox or What's new open over
 * it (`?open=`), or with neither for `null`.
 */
export function withOverlay(here: string, overlay: DashboardOverlay | null): string {
  // Parsed as a URL so a #fragment stays a fragment, after the query.
  const url = new URL(here, 'https://dashboard.invalid')
  if (overlay) url.searchParams.set('open', overlay)
  else url.searchParams.delete('open')
  return `${url.pathname}${url.search}${url.hash}`
}

/** A dashboard page with its "New …" dialog open (`?new=`): the page owning the dialog reads it. */
export function withNewDialog(
  path: string,
  dialog: 'project' | 'workspace' | 'org' | 'invite' | 'connection' | 'key' | 'variable' | 'import',
): string {
  return `${path}?${new URLSearchParams({ new: dialog })}`
}

/**
 * A workflow or function in its workspace: `/{org}/{project}/{workspace}/workflows/{id}`,
 * which opens its editor. Functions live at the same URL; the item says which it is.
 */
export function itemPath(slugs: WorkspaceSlugs, item: { id: string }): string {
  return `${projectPath(slugs)}/${segment(slugs.workspace)}/workflows/${segment(item.id)}`
}

/** A workflow or function's own pages, beside its editor: `…/workflows/{id}/{page}`. */
export const ITEM_PAGES = ['overview', 'runs', 'deployments', 'deploy'] as const
export type ItemPage = (typeof ITEM_PAGES)[number]

export function itemPagePath(slugs: WorkspaceSlugs, item: { id: string }, page: ItemPage): string {
  return `${itemPath(slugs, item)}/${page}`
}

/** One run of a workflow: `…/workflows/{id}/runs/{runId}`. */
export function runPath(slugs: WorkspaceSlugs, item: { id: string }, runId: string): string {
  return `${itemPagePath(slugs, item, 'runs')}/${segment(runId)}`
}

/**
 * Where a just-created item opens: its editor, on the template picker for a
 * workflow, unless it starts `blank`. Templates are workflow-shaped, so a
 * function opens straight on its canvas.
 */
export function newItemPath(
  slugs: WorkspaceSlugs,
  item: { id: string; kind: 'workflow' | 'script' },
  options: { blank?: boolean } = {},
): string {
  const path = itemPath(slugs, item)
  return item.kind === 'workflow' && !options.blank ? `${path}?template=1` : path
}

/** `/dashboard`: every organization you're in, invites waiting for you, Create an organization. */
export function dashboardPath(): string {
  return '/dashboard'
}

export function invitePath(token: string): string {
  return `/invite/${segment(token)}`
}
