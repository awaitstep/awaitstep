import { useMemo } from 'react'
import { useFeatureOn } from '../../lib/feature-switches'
import {
  orgExtensionPath,
  orgPath,
  projectPagePath,
  type ProjectSlugs,
} from '../../lib/dashboard-paths'
import { useEnabledExtensions } from '../../extensions/registry'
import type { WebExtension } from '../../extensions/types'

/** Where a new Cloudflare account is connected, from an account picker. */
export type ConnectAccountLink =
  | {
      kind: 'link'
      href: string
      /** The page's name: "Connections", or the extension's own (Cloud's "Integrations"). */
      label: string
    }
  /** Only org owners and admins connect accounts there: the viewer is told to ask one. */
  | { kind: 'ask'; label: string }

/**
 * Where the viewer connects an account the picker doesn't list yet.
 * - An enabled extension's `accounts.connect` page (Cloud's Integrations):
 *   only org managers can connect there, so anyone else is told to ask one.
 * - Else, while `connections.ui` is on: the org's Connections page for an
 *   org manager; the project's for a project admin, who can connect an
 *   account of the project's own there.
 * - Else nowhere (null).
 */
export function connectAccountLink(
  slugs: ProjectSlugs,
  extensions: readonly WebExtension[],
  connectionsOn: boolean,
  orgManager: boolean,
): ConnectAccountLink | null {
  for (const extension of extensions) {
    const page = extension.slots?.['accounts.connect']
    if (!page) continue
    return orgManager
      ? {
          kind: 'link',
          href: orgExtensionPath(slugs.org, extension.id, page.path),
          label: page.label,
        }
      : { kind: 'ask', label: page.label }
  }
  if (!connectionsOn) return null
  return orgManager
    ? { kind: 'link', href: orgPath(slugs.org, 'connections'), label: 'Connections' }
    : {
        kind: 'link',
        href: projectPagePath(slugs, 'connections'),
        label: 'project’s Connections',
      }
}

/** `connectAccountLink` for the instance's enabled extensions and feature switches. */
export function useConnectAccountLink(
  slugs: ProjectSlugs,
  orgManager: boolean,
): ConnectAccountLink | null {
  const extensions = useEnabledExtensions()
  const connectionsOn = useFeatureOn('connections.ui')
  const { org, project } = slugs
  return useMemo(
    () => connectAccountLink({ org, project }, extensions, connectionsOn, orgManager),
    [org, project, extensions, connectionsOn, orgManager],
  )
}
