import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { OrgRole } from '../types/dashboard/session'
import type { WorkspaceRole } from '../types/dashboard/workspaces'

/**
 * Where an extension's page is framed: in a workspace, with the workspace
 * panel beside it, or in Org Settings, as one of its tabs.
 */
export type ExtensionPageScope = 'workspace' | 'org-settings'

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
   * The viewer's effective role where the page is: the org's on a settings
   * tab, the workspace's on a workspace page. For showing or hiding controls;
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
 * A page of the extension's own, at `/<org>/settings/ext/<id>/<path>` or
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
  /** Org Settings tabs, after the built-in ones: links to `org-settings` pages. */
  'org.settings.tabs'?: ExtensionLink[]
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
