import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { DashboardPage } from '../../components/navigation/dashboard-page'
import { useOAuthResultToast } from '../../components/org-settings/use-oauth-result-toast'
import { IntegrationsPage, integrationsPageHead } from '../../extensions/extension-pages'
import { findIntegrationsPage, useEnabledExtensions } from '../../extensions/registry'

const page: DashboardPage = { kind: 'org', page: 'integrations' }

// Cloud's Integrations, drawn by an extension (`org.integrations`); an instance
// can send the Cloudflare OAuth callback here (`oauthReturnPath`).
export const Route = createFileRoute('/_authed/$org/integrations')({
  staticData: { dashboardPage: page },
  head: ({ matches }) => integrationsPageHead(matches),
  component: OrgIntegrationsRoute,
})

function OrgIntegrationsRoute() {
  const { org } = Route.useParams()
  const search = Route.useSearch()
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
  // The shell doesn't mount this without a drawn page; the guard keeps a
  // made-up `?oauth=ok` from announcing anything even if it did.
  const drawn = findIntegrationsPage(useEnabledExtensions()) !== undefined
  useOAuthResultToast(drawn ? search : {}, clearOAuth)
  return <IntegrationsPage org={org} />
}
