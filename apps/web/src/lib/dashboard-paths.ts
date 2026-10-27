import type { ScopeSlugs } from '../types/dashboard/scope'

// Every href in the new dashboard is built here, so the URL shape lives in one
// place: /{org}/{project}/{workspace}/{page}.

export const ORG_PAGES = ['projects', 'resources', 'audit', 'inbox', 'whats-new'] as const
export type OrgPage = (typeof ORG_PAGES)[number]

export const ORG_SETTINGS_PAGES = ['general', 'members', 'connections', 'api-keys'] as const
export type OrgSettingsPage = (typeof ORG_SETTINGS_PAGES)[number]

export const PROJECT_SETTINGS_PAGES = [
  'workspaces',
  'shared',
  'members',
  'api-keys',
  'variables',
  'general',
] as const
export type ProjectSettingsPage = (typeof PROJECT_SETTINGS_PAGES)[number]

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

/** Where a bare workspace URL goes: every card and switcher on the canvas links here. */
export const DEFAULT_WORKSPACE_PAGE: WorkspacePage = 'workflows'

/**
 * Slugs that a URL segment at each level can't be, because a route already
 * owns that path: the old app's top-level pages, and the new tree's own page
 * names. B1 enforces the same lists in the API.
 */
export const RESERVED_SLUGS = {
  org: [
    'api',
    'account',
    'api-playground',
    'choose-org',
    'connections',
    'dashboard',
    'env-vars',
    'invite',
    'runs',
    'settings',
    'sign-in',
    'workflows',
  ],
  project: [...ORG_PAGES, 'settings', 'account'],
  // A workspace's pages sit one level below it, so only the project's own
  // settings path collides.
  workspace: ['settings'],
} as const satisfies Record<'org' | 'project' | 'workspace', readonly string[]>

export function isReservedSlug(level: keyof typeof RESERVED_SLUGS, slug: string): boolean {
  return (RESERVED_SLUGS[level] as readonly string[]).includes(slug)
}

function segment(slug: string): string {
  return encodeURIComponent(slug)
}

export function orgPath(org: string, page: OrgPage = 'projects'): string {
  return `/${segment(org)}/${page}`
}

export function orgSettingsPath(org: string, page: OrgSettingsPage = 'general'): string {
  return `/${segment(org)}/settings/${page}`
}

/** The project URL itself, which lands in the last workspace. */
export function projectPath(slugs: ProjectSlugs): string {
  return `/${segment(slugs.org)}/${segment(slugs.project)}`
}

export function projectSettingsPath(
  slugs: ProjectSlugs,
  page: ProjectSettingsPage = 'workspaces',
): string {
  return `${projectPath(slugs)}/settings/${page}`
}

export function workspacePath(
  slugs: WorkspaceSlugs,
  page: WorkspacePage = DEFAULT_WORKSPACE_PAGE,
): string {
  return `${projectPath(slugs)}/${segment(slugs.workspace)}/${page}`
}

/** Your own account, shown in the org you're in so the rail keeps its place. */
export function accountPath(org: string, page: AccountPage = 'profile'): string {
  return `/${segment(org)}/account/${page}`
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

/** Project settings → Variables with a variable's dialog open (built in P6). */
export function variableDialogPath(
  slugs: ProjectSlugs,
  dialog: { kind: 'new' } | { kind: 'edit' | 'override'; name: string },
): string {
  const query =
    dialog.kind === 'new'
      ? new URLSearchParams({ new: 'variable' })
      : new URLSearchParams({
          variable: dialog.name,
          ...(dialog.kind === 'override' && { override: '1' }),
        })
  return `${projectSettingsPath(slugs, 'variables')}?${query}`
}

export function chooseOrgPath(): string {
  return '/choose-org'
}

export function invitePath(token: string): string {
  return `/invite/${segment(token)}`
}
