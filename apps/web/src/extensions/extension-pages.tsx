import type { AnyRouteMatch } from '@tanstack/react-router'
import installed from 'virtual:awaitstep/extensions'
import { pageHead } from '../components/navigation/dashboard-page'
import { PageNotFound } from '../components/navigation/dashboard-shell'
import { OrgSettingsIntro } from '../components/org-settings/org-settings-intro'
import { useOrgScope } from '../components/org-settings/use-org-scope'
import { PageBody } from '../components/shell/page-intro'
import { useScope } from '../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../lib/dashboard-paths'
import { itemScopeFrom } from '../lib/workflows/route-scope'
import {
  enabledExtensions,
  extensionPageKey,
  framedExtensionPage,
  resolveExtensionPage,
  useEnabledExtensions,
} from './registry'
import type { ExtensionPageScope } from './types'

/**
 * `head` for an extension's catch-all route. It runs before the layout puts
 * the features in the store, so it reads them from the `_authed` match.
 */
export function extensionPageHead(
  scope: ExtensionPageScope,
  splat: string | undefined,
  matches: readonly AnyRouteMatch[],
) {
  const loaderData = matches.find((match) => match.routeId === '/_authed')?.loaderData as
    { features?: readonly string[] } | undefined
  const resolved = resolveExtensionPage(
    enabledExtensions(installed, loaderData?.features ?? []),
    scope,
    splat,
  )
  return pageHead({ kind: 'extension', scope, page: framedExtensionPage(resolved) })
}

interface ExtensionWorkspacePageProps {
  slugs: WorkspaceSlugs
  splat: string | undefined
}

/** `/{org}/{project}/{workspace}/ext/{id}/{path}`: the page draws its own body, as built-in ones do. */
export function ExtensionWorkspacePage({ slugs, splat }: ExtensionWorkspacePageProps) {
  const resolved = resolveExtensionPage(useEnabledExtensions(), 'workspace', splat)
  // The shell resolved these slugs before the page rendered: this reads its cached answer.
  const lookup = useScope(slugs).data
  const ids = itemScopeFrom(lookup)
  const viewerRole = lookup?.found ? lookup.workspace?.viewerRole : undefined
  if (!resolved) return <PageNotFound />
  if (!ids || !viewerRole) return null
  const Page = resolved.page.component
  return (
    <Page
      org={slugs.org}
      project={slugs.project}
      workspace={slugs.workspace}
      ids={ids}
      viewerRole={viewerRole}
      subpath={resolved.subpath}
    />
  )
}

interface ExtensionOrgPageProps {
  org: string
  splat: string | undefined
}

/** `/{org}/ext/{id}/{path}`: an org-level page, a rail destination; it draws its own body. */
export function ExtensionOrgPage({ org, splat }: ExtensionOrgPageProps) {
  const resolved = resolveExtensionPage(useEnabledExtensions(), 'org', splat)
  const scope = useOrgScope(org)
  if (!resolved) return <PageNotFound />
  if (!scope) return null
  const Page = resolved.page.component
  return (
    <Page
      org={org}
      ids={{ organizationId: scope.org.id }}
      viewerRole={scope.viewerRole}
      subpath={resolved.subpath}
    />
  )
}

interface ExtensionSettingsPageProps {
  org: string
  splat: string | undefined
}

/** `/{org}/settings/ext/{id}/{path}`: under Org Settings' title and tabs, its tab marked. */
export function ExtensionSettingsPage({ org, splat }: ExtensionSettingsPageProps) {
  const resolved = resolveExtensionPage(useEnabledExtensions(), 'org-settings', splat)
  const scope = useOrgScope(org)
  if (!resolved) return <PageNotFound />
  if (!scope) return null
  const Page = resolved.page.component
  return (
    <PageBody>
      <OrgSettingsIntro
        org={scope.org}
        section={extensionPageKey(resolved.extension.id, resolved.page.path)}
      />
      <Page
        org={org}
        ids={{ organizationId: scope.org.id }}
        viewerRole={scope.viewerRole}
        subpath={resolved.subpath}
      />
    </PageBody>
  )
}
