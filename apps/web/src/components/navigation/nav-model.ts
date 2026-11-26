import {
  Activity,
  Bell,
  Blocks,
  BookOpen,
  Box,
  Braces,
  CirclePlay,
  Code,
  House,
  KeyRound,
  Layers,
  LayoutGrid,
  Library,
  Plug,
  Settings,
  Share2,
  Sparkles,
  SquareTerminal,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import {
  accountPath,
  DEFAULT_WORKSPACE_PAGE,
  itemPagePath,
  orgPath,
  withOverlay,
  orgExtensionPath,
  orgSettingsPath,
  projectWorkspacesPath,
  projectPagePath,
  workspacePath,
  workspaceExtensionPath,
  type ProjectPage,
  type WorkspacePage,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import type { OssFeature } from '@awaitstep/ir'
import { plural } from '../../lib/plural'
import { extensionPageKey, findIntegrationsPage } from '../../extensions/registry'
import type { ExtensionRailLink, WebExtension } from '../../extensions/types'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { RailEntry } from '../shell/org-rail'
import type { Crumb } from '../shell/top-bar'
import { pageLabel, type DashboardPage, type FramedItem } from './dashboard-page'

// What the frame shows for a page: which rail item is active, which panel is
// open and what's in it, and the breadcrumbs. Pure, so every page's frame can
// be checked without a router.

export interface NavItem {
  key: string
  href: string
  icon: LucideIcon
  label: string
}

/** Names the frame needs from the resolved scope. */
export interface ScopeNames {
  org: string
  project?: string
  workspace?: string
}

export type PanelModel =
  | { mode: 'none' }
  | {
      mode: 'workspace'
      /** The workspace URL's slugs, all three present. */
      slugs: WorkspaceSlugs
      /** The page being shown, kept when switching workspace. */
      page: WorkspacePage
      items: NavItem[]
      activeKey: string
      projectHref: string
    }
  | {
      /** A project's own pages: Workspaces, Library, Workflows & functions, Members, API keys, Variables, Settings. */
      mode: 'project'
      items: NavItem[]
      activeKey: string
    }

export interface RailModel {
  primary: RailEntry[]
  secondary: RailEntry[]
  activeKey: string
}

export const DOCS_URL = 'https://docs.awaitstep.dev'
export const RELEASES_URL = 'https://github.com/awaitstep/awaitstep/releases'

/** What the rail's Inbox and What's new need: where they open, and their markers. */
export interface RailOverlays {
  /** The current path and query: both open over it. */
  here: string
  unread: number
  freshReleases: number
}

/** What the instance changes in the rail: the features it switches off, and the enabled extensions. */
export interface RailOptions {
  disabled?: readonly OssFeature[]
  extensions?: readonly WebExtension[]
}

export function railModel(
  org: string,
  page: DashboardPage,
  overlays: RailOverlays,
  { disabled = [], extensions = [] }: RailOptions = {},
): RailModel {
  const on = (feature: OssFeature) => !disabled.includes(feature)
  const whatsNew: RailEntry = {
    key: 'whats-new',
    href: withOverlay(overlays.here, 'whats-new'),
    icon: Sparkles,
    label: 'What’s new',
    badge:
      overlays.freshReleases > 0
        ? { kind: 'dot', description: plural(overlays.freshReleases, 'new update') }
        : undefined,
  }
  const inbox: RailEntry = {
    key: 'inbox',
    href: withOverlay(overlays.here, 'inbox'),
    icon: Bell,
    label: 'Inbox',
    badge: {
      kind: 'count',
      value: overlays.unread,
      description: plural(overlays.unread, 'unread notification'),
    },
  }
  const primary: RailEntry[] = [
    { key: 'projects', href: orgPath(org, 'projects'), icon: House, label: 'Projects' },
    { key: 'resources', href: orgPath(org, 'resources'), icon: Box, label: 'Resources' },
    { key: 'audit', href: orgPath(org, 'audit'), icon: Activity, label: 'Audit log' },
    ...(on('connections.ui')
      ? [
          {
            key: 'connections',
            href: orgPath(org, 'connections'),
            icon: Plug,
            label: 'Connections',
          },
        ]
      : []),
    { key: 'api-keys', href: orgPath(org, 'api-keys'), icon: KeyRound, label: 'API' },
    // Integrations (when an extension draws it), then extensions' org pages: before Settings.
    ...railPrimaryEntries(org, extensions),
    { key: 'settings', href: orgSettingsPath(org), icon: Settings, label: 'Settings' },
  ]
  const playground: RailEntry = {
    key: 'playground',
    href: '/api-playground',
    icon: SquareTerminal,
    label: 'Playground',
  }
  const docs: RailEntry = {
    key: 'docs',
    href: DOCS_URL,
    icon: BookOpen,
    label: 'Docs',
    external: true,
  }
  return {
    primary,
    secondary: [
      whatsNew,
      inbox,
      ...(on('playground') ? [playground] : []),
      // Where an extension adds its own (Help, say): beside the Playground, before Docs.
      ...railExtensionEntries(extensions, overlays.here),
      ...(on('docs') ? [docs] : []),
    ],
    activeKey: railActiveKey(page),
  }
}

/**
 * Whether a rail link may be drawn: an `https:` URL when external, else an app
 * path (`/…`, not `//host`). Anything else — `javascript:` included — is dropped.
 */
export function isRailHref(href: string, external: boolean | undefined): boolean {
  if (!external) return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')
  try {
    return new URL(href).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The rail's lower-group entries of the enabled extensions, in installation
 * order: each one's `rail.secondary` links, then its `rail.panels`, which open
 * over `here` (the current path and query).
 */
export function railExtensionEntries(
  extensions: readonly WebExtension[],
  here: string,
): RailEntry[] {
  return extensions.flatMap((extension) => [
    ...(extension.slots?.['rail.secondary'] ?? []).flatMap((link, i) =>
      isRailHref(link.href, link.external) ? [railExtensionEntry(extension.id, link, i)] : [],
    ),
    ...(extension.slots?.['rail.panels'] ?? []).map((panel) => ({
      key: `panel:${panel.id}`,
      href: withOverlay(here, panel.id),
      icon: panel.icon,
      label: panel.label,
    })),
  ])
}

/**
 * The rail's main entries the enabled extensions bring: Integrations when one
 * draws it (`org.integrations`), then their `rail.primary` links to their org pages.
 */
export function railPrimaryEntries(org: string, extensions: readonly WebExtension[]): RailEntry[] {
  const integrations: RailEntry[] = findIntegrationsPage(extensions)
    ? [
        {
          key: 'integrations',
          href: orgPath(org, 'integrations'),
          icon: Blocks,
          label: 'Integrations',
        },
      ]
    : []
  return [
    ...integrations,
    ...extensions.flatMap((extension) =>
      (extension.slots?.['rail.primary'] ?? []).map((link) => ({
        key: extensionPageKey(extension.id, link.path),
        href: orgExtensionPath(org, extension.id, link.path),
        icon: link.icon,
        label: link.label,
      })),
    ),
  ]
}

function railExtensionEntry(id: string, link: ExtensionRailLink, i: number): RailEntry {
  return {
    key: `ext:${id}#${i}`,
    href: link.href,
    icon: link.icon,
    label: link.label,
    external: link.external,
  }
}

/** The phone tab bar: the rail's main destinations plus Inbox. */
export const TAB_BAR_KEYS = ['projects', 'resources', 'audit', 'inbox', 'settings'] as const

/**
 * The tab bar's entries. Its Inbox is a page of its own, in the frame like
 * the other tabs, not the rail's overlay, which on a phone covers the whole
 * screen, tab bar included.
 */
export function tabBarEntries(rail: RailModel, org: string): RailEntry[] {
  const all = [...rail.primary, ...rail.secondary]
  return TAB_BAR_KEYS.map((key) => {
    const entry = all.find((e) => e.key === key)!
    return key === 'inbox' ? { ...entry, href: orgPath(org, 'inbox') } : entry
  })
}

function railActiveKey(page: DashboardPage): string {
  switch (page.kind) {
    case 'org':
      return page.page
    case 'org-settings':
      return 'settings'
    case 'extension':
      if (page.scope === 'org') return page.page?.key ?? ''
      return page.scope === 'org-settings' ? 'settings' : 'projects'
    case 'account':
      // Your account isn't one of the rail's places.
      return ''
    case 'playground':
      return 'playground'
    default:
      // Project and workspace pages are all inside "Projects".
      return 'projects'
  }
}

function workspaceItems(
  slugs: Required<ScopeSlugs>,
  extensions: readonly WebExtension[],
): NavItem[] {
  const item = (page: WorkspacePage, icon: LucideIcon): NavItem => ({
    key: page,
    href: workspacePath(slugs, page),
    icon,
    label: pageLabel({ kind: 'workspace', page }),
  })
  return [
    item('overview', LayoutGrid),
    item('workflows', Workflow),
    item('functions', Code),
    item('scripts-nodes', Library),
    item('runs', CirclePlay),
    ...workspaceExtensionItems(slugs, extensions),
    item('settings', Settings),
  ]
}

/** The `workspace.nav` links of the enabled extensions, after the built-in pages. */
function workspaceExtensionItems(
  slugs: Required<ScopeSlugs>,
  extensions: readonly WebExtension[],
): NavItem[] {
  return extensions.flatMap((extension) =>
    (extension.slots?.['workspace.nav'] ?? []).map((link) => ({
      key: extensionPageKey(extension.id, link.path),
      href: workspaceExtensionPath(slugs, extension.id, link.path),
      icon: link.icon,
      label: link.label,
    })),
  )
}

function projectItems(
  slugs: { org: string; project: string },
  disabled: readonly OssFeature[],
): NavItem[] {
  const item = (page: ProjectPage, icon: LucideIcon): NavItem => ({
    key: page,
    href: projectPagePath(slugs, page),
    icon,
    label: pageLabel({ kind: 'project', page }),
  })
  return [
    item('workspaces', Layers),
    item('scripts-nodes', Library),
    item('shared', Share2),
    item('members', Users),
    ...(disabled.includes('connections.ui') ? [] : [item('connections', Plug)]),
    item('api-keys', KeyRound),
    item('variables', Braces),
    item('settings', Settings),
  ]
}

/**
 * The panel beside a page. `extensions` are the enabled ones (`useEnabledExtensions`):
 * their links join the workspace panel. `disabled` is what the instance switches off.
 */
export function panelModel(
  page: DashboardPage,
  slugs: ScopeSlugs,
  extensions: readonly WebExtension[] = [],
  disabled: readonly OssFeature[] = [],
): PanelModel {
  switch (page.kind) {
    case 'org':
    case 'org-settings':
    case 'account':
    case 'playground':
    case 'editor':
      // Every org-level page is its own rail item: none opens a second panel.
      // (The editor draws no frame at all.)
      return { mode: 'none' }
    case 'project':
      return {
        mode: 'project',
        items: projectItems({ org: slugs.org, project: slugs.project! }, disabled),
        activeKey: page.page,
      }
    case 'workspace':
      return workspacePanel(slugs, page.page, page.page, extensions)
    case 'item': {
      // An item's pages sit under the list it's in; until its kind loads,
      // nothing is marked rather than guessing Workflows for a function.
      const list = itemListPage(page.item)
      return workspacePanel(slugs, list ?? 'workflows', list ?? '', extensions)
    }
    case 'extension':
      // Org Settings' extension tabs are tabs on that page, like its own; an
      // org page is its own rail item.
      if (page.scope !== 'workspace') return { mode: 'none' }
      // Switching workspace from an extension's page opens the new one's Overview.
      return workspacePanel(slugs, DEFAULT_WORKSPACE_PAGE, page.page?.key ?? '', extensions)
  }
}

function workspacePanel(
  slugs: ScopeSlugs,
  page: WorkspacePage,
  activeKey: string,
  extensions: readonly WebExtension[],
): PanelModel {
  // A workspace page's route always has all three slugs.
  const workspace: WorkspaceSlugs = {
    org: slugs.org,
    project: slugs.project!,
    workspace: slugs.workspace!,
  }
  return {
    mode: 'workspace',
    slugs: workspace,
    page,
    items: workspaceItems(workspace, extensions),
    activeKey,
    projectHref: projectWorkspacesPath(workspace),
  }
}

/** The workspace list an item belongs on: Functions for a function, else Workflows. */
function itemListPage(item: FramedItem | undefined): WorkspacePage | null {
  if (!item?.kind) return null
  return item.kind === 'script' ? 'functions' : 'workflows'
}

/**
 * Starts at the org — or at "Your account", which is the same in every org —
 * and ends on the current page, which is never a link.
 */
export function breadcrumbs(page: DashboardPage, slugs: ScopeSlugs, names: ScopeNames): Crumb[] {
  if (page.kind === 'account') {
    return [{ label: 'Your account', href: accountPath() }, { label: pageLabel(page) }]
  }
  // The playground is org-less: a single crumb, no organization before it.
  if (page.kind === 'playground') {
    return [{ label: pageLabel(page) }]
  }
  const crumbs: Crumb[] = [{ label: names.org, href: orgPath(slugs.org) }]
  if (page.kind === 'extension' && page.scope === 'org') {
    crumbs.push({ label: pageLabel(page) })
    return crumbs
  }
  // Settings' sections are tabs on the page: the crumb stops at Settings.
  if (
    page.kind === 'org-settings' ||
    (page.kind === 'extension' && page.scope === 'org-settings')
  ) {
    crumbs.push({ label: 'Settings' })
    return crumbs
  }
  const inWorkspace = page.kind === 'workspace' || page.kind === 'item' || page.kind === 'extension'
  if (page.kind === 'project' || inWorkspace) {
    crumbs.push({
      label: names.project ?? slugs.project!,
      href: projectWorkspacesPath({ org: slugs.org, project: slugs.project! }),
    })
  }
  if (inWorkspace) {
    crumbs.push({
      label: names.workspace ?? slugs.workspace!,
      href: workspacePath(slugs as Required<ScopeSlugs>),
    })
  }
  if (page.kind === 'item' && page.item) crumbs.push(...itemCrumbs(page.item, slugs))
  crumbs.push({ label: pageLabel(page) })
  return crumbs
}

/** "Workflows / Lead enrichment" before an item's page; the name links to its Overview. */
function itemCrumbs(item: FramedItem, slugs: ScopeSlugs): Crumb[] {
  const workspace = slugs as WorkspaceSlugs
  const list = itemListPage(item)
  const crumbs: Crumb[] = []
  if (list) {
    crumbs.push({
      label: pageLabel({ kind: 'workspace', page: list }),
      href: workspacePath(workspace, list),
    })
  }
  crumbs.push({
    label: item.name ?? item.id,
    href: itemPagePath(workspace, item, 'overview'),
  })
  return crumbs
}
