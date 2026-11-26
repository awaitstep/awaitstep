import type { OssFeature } from '@awaitstep/ir'
import type { WebExtension } from '../../extensions/types'
import { accountPath } from '../../lib/dashboard-paths'
import type { Theme } from '../../lib/theme'
import {
  APP_SHORTCUTS,
  SHORTCUT_GROUP_LABELS,
  type AppShortcutId,
  type ShortcutGroup,
} from '../../lib/shortcuts/registry'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { panelModel, railModel, type NavItem } from '../navigation/nav-model'

export type PaletteTarget =
  { kind: 'href'; href: string; external?: boolean } | { kind: 'shortcut'; id: AppShortcutId }

export interface PaletteItem {
  /** Unique across the palette; cmdk filters on it with the label. */
  id: string
  label: string
  target: PaletteTarget
  /** The shortcut that does the same, shown beside it. */
  shortcut?: AppShortcutId
}

export interface PaletteGroup {
  heading: string
  items: PaletteItem[]
}

export interface PaletteInput {
  slugs: ScopeSlugs
  /** Where Inbox and What's new open over: the current page, or the org's home in the editor. */
  overlayBase: string
  theme: Theme
  /** What the current page can run (`dispatcher.bound()`), innermost first. */
  bound: readonly AppShortcutId[]
  disabled?: readonly OssFeature[]
  extensions?: readonly WebExtension[]
}

/** The rail's items that have a `g` key, by rail key. */
const RAIL_SHORTCUTS: Readonly<Record<string, AppShortcutId>> = {
  projects: 'goProjects',
  resources: 'goResources',
  audit: 'goAudit',
  'api-keys': 'goApiKeys',
  settings: 'goSettings',
  inbox: 'goInbox',
  'whats-new': 'goWhatsNew',
}

const WORKSPACE_SHORTCUTS: Readonly<Record<string, AppShortcutId>> = {
  workflows: 'goWorkflows',
  functions: 'goFunctions',
  runs: 'goRuns',
}

/** A palette group's page items, which open their link. */
function navGroup(
  heading: string,
  prefix: string,
  items: readonly Pick<NavItem, 'key' | 'href' | 'label'>[],
  shortcuts: Readonly<Record<string, AppShortcutId>>,
  externals: ReadonlySet<string> = new Set(),
): PaletteGroup {
  return {
    heading,
    items: items.map((item) => ({
      id: `${prefix}:${item.key}`,
      label: item.label,
      target: { kind: 'href', href: item.href, external: externals.has(item.key) || undefined },
      shortcut: shortcuts[item.key],
    })),
  }
}

/**
 * What the ⌘K palette lists where you are: the rail's pages, the current
 * workspace's or project's pages, the current page's own actions, and the
 * general ones. The `g` keys go wherever the palette's items with their
 * shortcut go, so a page the instance switches off has neither.
 */
export function paletteModel(input: PaletteInput): PaletteGroup[] {
  const { slugs, overlayBase, disabled = [], extensions = [] } = input
  const rail = railModel(
    slugs.org,
    { kind: 'org', page: 'projects' },
    { here: overlayBase, unread: 0, freshReleases: 0 },
    { disabled, extensions },
  )
  const railEntries = [...rail.primary, ...rail.secondary]
  const externals = new Set(railEntries.filter((e) => e.external).map((e) => e.key))
  const groups: PaletteGroup[] = [
    navGroup(
      'Go to',
      'org',
      [...railEntries, { key: 'account', href: accountPath(), label: 'Your account' }],
      RAIL_SHORTCUTS,
      externals,
    ),
  ]

  if (slugs.workspace) {
    const panel = panelModel({ kind: 'workspace', page: 'overview' }, slugs, extensions, disabled)
    if (panel.mode === 'workspace')
      groups.push(navGroup('This workspace', 'workspace', panel.items, WORKSPACE_SHORTCUTS))
  } else if (slugs.project) {
    const panel = panelModel({ kind: 'project', page: 'workspaces' }, slugs, extensions, disabled)
    if (panel.mode === 'project') groups.push(navGroup('This project', 'project', panel.items, {}))
  }

  // The current page's own actions, in its groups: "Deploy" under its workflow.
  const pageGroups = new Map<ShortcutGroup, PaletteItem[]>()
  for (const id of input.bound) {
    const shortcut = APP_SHORTCUTS[id]
    if (shortcut.scope === 'global') continue
    const items = pageGroups.get(shortcut.group) ?? []
    items.push({
      id: `action:${id}`,
      label: shortcut.label,
      target: { kind: 'shortcut', id },
      shortcut: id,
    })
    pageGroups.set(shortcut.group, items)
  }
  for (const [group, items] of pageGroups)
    groups.push({ heading: SHORTCUT_GROUP_LABELS[group], items })

  const general: PaletteItem[] = [
    {
      id: 'action:theme',
      label: input.theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme',
      target: { kind: 'shortcut', id: 'theme' },
      shortcut: 'theme',
    },
    {
      id: 'action:help',
      label: 'Keyboard shortcuts',
      target: { kind: 'shortcut', id: 'help' },
      shortcut: 'help',
    },
  ]
  groups.push({ heading: SHORTCUT_GROUP_LABELS.general, items: general })
  return groups.filter((group) => group.items.length > 0)
}

/** Where each `g` key goes here, read off the palette's own links. */
export function goTargets(groups: readonly PaletteGroup[]): Partial<Record<AppShortcutId, string>> {
  const targets: Partial<Record<AppShortcutId, string>> = {}
  for (const group of groups)
    for (const item of group.items)
      if (item.shortcut && item.target.kind === 'href' && !item.target.external)
        targets[item.shortcut] ??= item.target.href
  return targets
}
