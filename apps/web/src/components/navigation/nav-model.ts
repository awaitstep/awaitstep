import {
  Activity,
  Bell,
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
  orgPath,
  withOverlay,
  orgSettingsPath,
  projectPath,
  projectSettingsPath,
  workspacePath,
  type ProjectSettingsPage,
  type WorkspacePage,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { plural } from '../../lib/plural'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { RailEntry } from '../shell/org-rail'
import type { Crumb } from '../shell/top-bar'
import { pageLabel, type DashboardPage } from './dashboard-page'

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
      projectSettingsHref: string
    }
  | { mode: 'project-settings'; items: NavItem[]; activeKey: string; backHref: string }

export interface RailModel {
  primary: RailEntry[]
  secondary: RailEntry[]
  activeKey: string
}

export const DOCS_URL = 'https://docs.awaitstep.dev'

/** What the rail's Inbox and What's new need: where they open, and their markers. */
export interface RailOverlays {
  /** The current path and query: both open over it. */
  here: string
  unread: number
  freshReleases: number
}

export function railModel(org: string, page: DashboardPage, overlays: RailOverlays): RailModel {
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
  return {
    primary: [
      { key: 'projects', href: orgPath(org, 'projects'), icon: House, label: 'Projects' },
      { key: 'resources', href: orgPath(org, 'resources'), icon: Box, label: 'Resources' },
      { key: 'audit', href: orgPath(org, 'audit'), icon: Activity, label: 'Audit log' },
      { key: 'connections', href: orgPath(org, 'connections'), icon: Plug, label: 'Connections' },
      { key: 'api-keys', href: orgPath(org, 'api-keys'), icon: KeyRound, label: 'API' },
      { key: 'settings', href: orgSettingsPath(org), icon: Settings, label: 'Settings' },
    ],
    secondary: [
      whatsNew,
      inbox,
      {
        key: 'playground',
        href: '/api-playground',
        icon: SquareTerminal,
        label: 'Playground',
      },
      { key: 'docs', href: DOCS_URL, icon: BookOpen, label: 'Docs', external: true },
    ],
    activeKey: railActiveKey(page),
  }
}

/** The phone tab bar: the rail's main destinations plus Inbox. */
export const TAB_BAR_KEYS = ['projects', 'resources', 'audit', 'inbox', 'settings'] as const

export function tabBarEntries(rail: RailModel): RailEntry[] {
  const all = [...rail.primary, ...rail.secondary]
  return TAB_BAR_KEYS.map((key) => all.find((entry) => entry.key === key)!)
}

function railActiveKey(page: DashboardPage): string {
  switch (page.kind) {
    case 'org':
      return page.page
    case 'org-settings':
      return 'settings'
    case 'account':
      // Your account isn't one of the rail's places.
      return ''
    default:
      // Project and workspace pages are all inside "Projects".
      return 'projects'
  }
}

function workspaceItems(slugs: Required<ScopeSlugs>): NavItem[] {
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
    item('library', Library),
    item('runs', CirclePlay),
    item('settings', Settings),
  ]
}

function projectSettingsItems(slugs: { org: string; project: string }): NavItem[] {
  const item = (page: ProjectSettingsPage, icon: LucideIcon): NavItem => ({
    key: page,
    href: projectSettingsPath(slugs, page),
    icon,
    label: pageLabel({ kind: 'project-settings', page }),
  })
  return [
    item('workspaces', Layers),
    item('shared', Share2),
    item('members', Users),
    item('api-keys', KeyRound),
    item('variables', Braces),
    item('general', Settings),
  ]
}

export function panelModel(page: DashboardPage, slugs: ScopeSlugs): PanelModel {
  switch (page.kind) {
    case 'org':
    case 'org-settings':
    case 'account':
    case 'item':
      // Every org-level page is its own rail item: none opens a second panel.
      return { mode: 'none' }
    case 'project-settings': {
      const project = { org: slugs.org, project: slugs.project! }
      return {
        mode: 'project-settings',
        items: projectSettingsItems(project),
        activeKey: page.page,
        // The project URL lands in the last workspace.
        backHref: projectPath(project),
      }
    }
    case 'workspace': {
      // A workspace page's route always has all three slugs.
      const workspace: WorkspaceSlugs = {
        org: slugs.org,
        project: slugs.project!,
        workspace: slugs.workspace!,
      }
      return {
        mode: 'workspace',
        slugs: workspace,
        page: page.page,
        items: workspaceItems(workspace),
        activeKey: page.page,
        projectSettingsHref: projectSettingsPath(workspace),
      }
    }
  }
}

/**
 * Starts at the org — or at "Your account", which is the same in every org —
 * and ends on the current page, which is never a link.
 */
export function breadcrumbs(page: DashboardPage, slugs: ScopeSlugs, names: ScopeNames): Crumb[] {
  if (page.kind === 'account') {
    return [{ label: 'Your account', href: accountPath(slugs.org) }, { label: pageLabel(page) }]
  }
  const crumbs: Crumb[] = [{ label: names.org, href: orgPath(slugs.org) }]
  // Settings' sections are tabs on the page: the crumb stops at Settings.
  if (page.kind === 'org-settings') {
    crumbs.push({ label: 'Settings' })
    return crumbs
  }
  if (page.kind === 'project-settings' || page.kind === 'workspace') {
    crumbs.push({
      label: names.project ?? slugs.project!,
      href: projectPath({ org: slugs.org, project: slugs.project! }),
    })
  }
  if (page.kind === 'project-settings') crumbs.push({ label: 'Settings' })
  if (page.kind === 'workspace') {
    crumbs.push({
      label: names.workspace ?? slugs.workspace!,
      href: workspacePath(slugs as Required<ScopeSlugs>),
    })
  }
  crumbs.push({ label: pageLabel(page) })
  return crumbs
}
