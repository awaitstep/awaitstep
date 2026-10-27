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
  orgSettingsPath,
  projectPath,
  projectSettingsPath,
  workspacePath,
  type OrgSettingsPage,
  type ProjectSettingsPage,
  type WorkspacePage,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
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
  | {
      mode: 'org-settings'
      items: NavItem[]
      activeKey: string
      back: { href: string; label: string }
    }

export interface RailModel {
  primary: RailEntry[]
  secondary: RailEntry[]
  activeKey: string
}

export const DOCS_URL = 'https://docs.awaitstep.dev'

export function railModel(org: string, page: DashboardPage): RailModel {
  return {
    primary: [
      { key: 'projects', href: orgPath(org, 'projects'), icon: House, label: 'Projects' },
      { key: 'resources', href: orgPath(org, 'resources'), icon: Box, label: 'Resources' },
      { key: 'audit', href: orgPath(org, 'audit'), icon: Activity, label: 'Audit log' },
      { key: 'settings', href: orgSettingsPath(org), icon: Settings, label: 'Settings' },
    ],
    // Badges arrive with the Inbox and What's new data (P8).
    secondary: [
      { key: 'whats-new', href: orgPath(org, 'whats-new'), icon: Sparkles, label: 'What’s new' },
      { key: 'inbox', href: orgPath(org, 'inbox'), icon: Bell, label: 'Inbox' },
      { key: 'api', href: '/api-playground', icon: SquareTerminal, label: 'API' },
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

function orgSettingsItems(org: string): NavItem[] {
  const item = (page: OrgSettingsPage, icon: LucideIcon): NavItem => ({
    key: page,
    href: orgSettingsPath(org, page),
    icon,
    label: pageLabel({ kind: 'org-settings', page }),
  })
  return [
    item('general', Settings),
    item('members', Users),
    item('connections', Plug),
    item('api-keys', KeyRound),
  ]
}

/** The project to offer "Back to …" from org settings: the last one opened, if known. */
export interface LastProject {
  slug: string
  name: string
}

export function panelModel(
  page: DashboardPage,
  slugs: ScopeSlugs,
  lastProject: LastProject | null,
): PanelModel {
  switch (page.kind) {
    case 'org':
    case 'account':
    case 'item':
      return { mode: 'none' }
    case 'org-settings':
      return {
        mode: 'org-settings',
        items: orgSettingsItems(slugs.org),
        activeKey: page.page,
        back: lastProject
          ? {
              href: projectPath({ org: slugs.org, project: lastProject.slug }),
              label: `Back to ${lastProject.name}`,
            }
          : { href: orgPath(slugs.org), label: 'Back to projects' },
      }
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
  if (page.kind === 'org-settings') crumbs.push({ label: 'Settings' })
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
