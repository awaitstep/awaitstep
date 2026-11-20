import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { DashboardPage } from '../../components/navigation/dashboard-page'
import { useOAuthResultToast } from '../../components/org-settings/use-oauth-result-toast'
import { extensionPageHead, ExtensionOrgPage } from '../../extensions/extension-pages'
import { isAccountsConnectPage, useEnabledExtensions } from '../../extensions/registry'

const page: DashboardPage = { kind: 'extension', scope: 'org' }

// An extension's org-level page, reached from the rail: /{org}/ext/{id}/{path}.
export const Route = createFileRoute('/_authed/$org/ext/$')({
  staticData: { dashboardPage: page },
  head: ({ params, matches }) => extensionPageHead('org', params._splat, matches),
  component: ExtensionOrgRoute,
})

function ExtensionOrgRoute() {
  const { org, _splat } = Route.useParams()
  const search = Route.useSearch()
  // Only the page accounts are connected on announces a callback result; on
  // any other page `?oauth=` is a link someone made up, and shows nothing.
  const announces = isAccountsConnectPage(useEnabledExtensions(), _splat)
  const navigate = Route.useNavigate()
  const clearOAuth = useCallback(() => {
    void navigate({
      search: (prev) => ({
        ...prev,
        oauth: undefined,
        account: undefined,
        reason: undefined,
        connected: undefined,
      }),
      replace: true,
    })
  }, [navigate])
  // An instance can send the Cloudflare OAuth callback here (`oauthReturnPath`).
  useOAuthResultToast(announces ? search : {}, clearOAuth)
  return <ExtensionOrgPage org={org} splat={_splat} />
}
