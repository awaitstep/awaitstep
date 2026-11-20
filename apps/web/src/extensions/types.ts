import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { OrgRole } from '../types/dashboard/session'
import type { WorkspaceRole } from '../types/dashboard/workspaces'

/**
 * Where an extension's page is framed: in a workspace, with the workspace
 * panel beside it; in Org Settings, as one of its tabs; or at org level,
 * as a rail destination of its own (`rail.primary`).
 */
export type ExtensionPageScope = 'workspace' | 'org-settings' | 'org'

/** The ids the API scopes requests by (`organizationId`, `projectId`, `workspaceId` params). */
export interface ExtensionScopeIds {
  organizationId: string
  /** Present on a workspace page and in the editors. */
  projectId?: string
  workspaceId?: string
}

/** The scope an extension page is opened in: its URL's slugs and the ids behind them. */
export interface ExtensionPageProps {
  org: string
  /** Present on a workspace page. */
  project?: string
  workspace?: string
  ids: ExtensionScopeIds
  /**
   * The viewer's effective role where the page is: the org's on an org page
   * or a settings tab, the workspace's on a workspace page. For showing or hiding controls;
   * the extension's API routes still check access themselves.
   */
  viewerRole: OrgRole | WorkspaceRole
  /**
   * What follows the page's own path in the URL, for a `nested` page; `''`
   * otherwise. It comes from the URL: treat it as untrusted input.
   */
  subpath: string
}

/**
 * A page of the extension's own, at `/<org>/ext/<id>/<path>`,
 * `/<org>/settings/ext/<id>/<path>` or
 * `/<org>/<project>/<workspace>/ext/<id>/<path>`. It renders inside the
 * dashboard frame, behind its scope check.
 */
export interface ExtensionPage {
  scope: ExtensionPageScope
  /** Below `ext/<id>/`; `''` is the extension's first page. Leading and trailing slashes are ignored. */
  path: string
  /**
   * Also answers the URLs below `path` (`history/r_1` for `history`), handing
   * the rest over as `subpath`. A page whose path matches exactly wins.
   */
  nested?: boolean
  /** The breadcrumb and document title. */
  title: string
  component: ComponentType<ExtensionPageProps>
}

/** A link to one of the extension's pages, in a nav list or a tab row. */
export interface ExtensionLink {
  /** The page's `path`. */
  path: string
  label: string
}

export interface ExtensionNavLink extends ExtensionLink {
  icon: LucideIcon
}

/**
 * A link in the rail's lower group: an outside URL (`external`) or an app
 * path. The rail never marks it as the current page; a link to an
 * extension's own org page belongs in `rail.primary`.
 */
export interface ExtensionRailLink {
  /** An `https:` URL with `external`, else an app path (`/…`). Any other href is not drawn. */
  href: string
  label: string
  icon: LucideIcon
  /** Opens in a new tab, as Docs does. */
  external?: boolean
}

/** What a rail panel's component is handed. */
export interface ExtensionPanelProps {
  org: string
  /** Closes the panel: back to the page under it. */
  onClose: () => void
}

/**
 * An entry in the rail's lower group that opens a panel over the current page,
 * as Inbox does: `?open=<id>`. The dashboard draws the panel's frame (title,
 * close button); `component` is its body.
 */
export interface ExtensionPanel {
  /**
   * The `?open=` value: lowercase letters, digits and inner dashes. Unique
   * across the installed extensions and never a built-in overlay's
   * (`inbox`, `whats-new`, `marketplace`).
   */
  id: string
  label: string
  icon: LucideIcon
  component: ComponentType<ExtensionPanelProps>
}

/** What an editor's top bar hands its extension controls. */
export interface EditorSlotProps {
  workflowId: string
  org: string
  project: string
  workspace: string
  ids: Required<ExtensionScopeIds>
  /** The viewer may change this workflow right now (role, and not an older version). */
  canEdit: boolean
}

/** The places in the dashboard an extension can add to. */
export interface WebExtensionSlots {
  /** Workspace side panel, after the built-in pages: links to `workspace` pages. */
  'workspace.nav'?: ExtensionNavLink[]
  /** The rail's main group, before Settings: links to `org` pages. */
  'rail.primary'?: ExtensionNavLink[]
  /** The rail's lower group, after Inbox (where the Playground is) and before Docs. */
  'rail.secondary'?: ExtensionRailLink[]
  /** The rail's lower group, after the `rail.secondary` links: entries that open a panel. */
  'rail.panels'?: ExtensionPanel[]
  /** Org Settings tabs, after the built-in ones: links to `org-settings` pages. */
  'org.settings.tabs'?: ExtensionLink[]
  /**
   * The `org` page where Cloudflare accounts are connected (Cloud's
   * Integrations). The Settings account pickers link to it in place of the
   * org's Connections page; the first enabled extension's wins.
   */
  'accounts.connect'?: ExtensionLink
  /** The canvas editor's top bar, left of Save. It owns whatever it opens. */
  'canvas.toolbar'?: ComponentType<EditorSlotProps>
  /** The Code editor's top bar, left of Save. It owns whatever it opens. */
  'ide.toolbar'?: ComponentType<EditorSlotProps>
}

export type SlotName = keyof WebExtensionSlots

/** What a nav item or tab of an extension page is marked active by: `ext:<id>/<path>`. */
export type ExtensionPageKey = `ext:${string}`

/**
 * A feature plugged into the dashboard from outside this repository. It shows
 * only when the API instance lists its `id` in `GET /api/instance` → `features`.
 */
export interface WebExtension {
  /** The same id as the API extension: lowercase letters, digits and inner dashes, at most 64. */
  id: string
  slots?: WebExtensionSlots
  pages?: ExtensionPage[]
}
