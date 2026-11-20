import type {
  AccountPage,
  ItemPage,
  OrgPage,
  OrgSettingsPage,
  ProjectPage,
  WorkspacePage,
} from '../../lib/dashboard-paths'
import type { OssFeature } from '@awaitstep/ir'
import type { ItemKind } from '../../types/dashboard/items'
import type { ExtensionPageKey, ExtensionPageScope, WebExtension } from '../../extensions/types'
import { findIntegrationsPage } from '../../extensions/registry'

/** A workflow or function page's own pages, and one run of it. */
export type ItemDetailPage = ItemPage | 'run'

/**
 * The item a detail page is about. Its route declares only the page; the
 * shell adds the id from the URL, and the name and kind once they load.
 */
export interface FramedItem {
  id: string
  name?: string
  kind?: ItemKind
}

/** Which dashboard page a route is. Each page route declares it in `staticData`. */
export type DashboardPage =
  | { kind: 'org'; page: OrgPage }
  | { kind: 'org-settings'; page: OrgSettingsPage }
  /** `/{org}/{project}/{page}`: Workspaces (the welcome while it's new), Members, Settings… */
  | { kind: 'project'; page: ProjectPage }
  | { kind: 'workspace'; page: WorkspacePage }
  | { kind: 'account'; page: AccountPage }
  /** The API Playground: a top-level developer tool, framed by the current org's rail. */
  | { kind: 'playground' }
  /** A workflow or function's editor, full screen: no rail, no panel. */
  | { kind: 'editor' }
  /** A workflow or function's Overview, Runs, one run, Deployments or Deploy, in its workspace. */
  | { kind: 'item'; page: ItemDetailPage; item?: FramedItem }
  /**
   * A page an extension adds (`…/ext/{id}/{path}`). Its route declares only the
   * scope; the shell adds which page it is once the URL resolves to one.
   */
  | { kind: 'extension'; scope: ExtensionPageScope; page?: FramedExtensionPage }

/** The extension page the URL names, as the frame needs it. */
export interface FramedExtensionPage {
  /** `extensionPageKey(id, path)`: what its nav item or tab is marked by. */
  key: ExtensionPageKey
  title: string
}

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
  integrations: 'Integrations',
}

const ORG_SETTINGS_LABEL: Record<OrgSettingsPage, string> = {
  general: 'General',
  members: 'Members',
}

const PROJECT_PAGE_LABEL: Record<ProjectPage, string> = {
  workspaces: 'Workspaces',
  'scripts-nodes': 'Scripts & nodes',
  shared: 'Workflows & functions',
  members: 'Members',
  connections: 'Connections',
  'api-keys': 'API keys',
  variables: 'Variables',
  settings: 'Settings',
}

const WORKSPACE_PAGE_LABEL: Record<WorkspacePage, string> = {
  overview: 'Overview',
  workflows: 'Workflows',
  functions: 'Functions',
  'scripts-nodes': 'Scripts & nodes',
  runs: 'Runs',
  settings: 'Workspace settings',
}

const ITEM_PAGE_LABEL: Record<ItemDetailPage, string> = {
  overview: 'Overview',
  runs: 'Runs',
  run: 'Run',
  deployments: 'Deployments',
  deploy: 'Deploy',
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
    case 'playground':
      return 'API Playground'
    case 'editor':
      return 'Editor'
    case 'item':
      return ITEM_PAGE_LABEL[page.page]
    case 'extension':
      return page.page?.title ?? 'Page not found'
  }
}

/** The document title: "Workflows · AwaitStep". */
export function pageTitle(page: DashboardPage): string {
  return `${pageLabel(page)} · AwaitStep`
}

/** The open-source feature a page belongs to, which an instance can switch off; null for the rest. */
export function pageFeature(page: DashboardPage): OssFeature | null {
  if (page.kind === 'playground') return 'playground'
  if ((page.kind === 'org' || page.kind === 'project') && page.page === 'connections') {
    return 'connections.ui'
  }
  return null
}

/** Whether the instance switches the page off: it answers page-not-found. */
export function pageSwitchedOff(page: DashboardPage, disabled: readonly OssFeature[]): boolean {
  const feature = pageFeature(page)
  return feature !== null && disabled.includes(feature)
}

/**
 * `head` for a dashboard route. `disabled` (`disabledIn(matches)`) is what
 * the instance switches off: a page it switches off is titled as not found.
 */
/**
 * Whether the page answers page-not-found here: switched off, or Integrations
 * with no enabled extension to draw it. Either way it never mounts.
 */
export function pageUnavailable(
  page: DashboardPage,
  disabled: readonly OssFeature[],
  extensions: readonly WebExtension[],
): boolean {
  if (pageSwitchedOff(page, disabled)) return true
  return page.kind === 'org' && page.page === 'integrations' && !findIntegrationsPage(extensions)
}

export function pageHead(page: DashboardPage, disabled: readonly OssFeature[] = []) {
  const title = pageSwitchedOff(page, disabled) ? 'Page not found · AwaitStep' : pageTitle(page)
  return { meta: [{ title }] }
}
