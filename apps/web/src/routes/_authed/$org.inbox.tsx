import { createFileRoute, redirect } from '@tanstack/react-router'
import { inboxLanding } from '../../components/inbox/inbox-landing'
import { InboxPage } from '../../components/inbox/inbox-page'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { isPhoneLayout } from '../../lib/phone-layout'

const page: DashboardPage = { kind: 'org', page: 'inbox' }

// On a phone the tab bar's Inbox is this page; wider, the URL opens the
// overlay over Projects (see `inboxLanding`).
export const Route = createFileRoute('/_authed/$org/inbox')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  beforeLoad: ({ params, search }) => {
    const landing = inboxLanding(search, isPhoneLayout())
    if (landing.kind === 'redirect')
      throw redirect({ to: landing.to, params, search: landing.search, replace: true })
  },
  component: OrgInboxPage,
})

function OrgInboxPage() {
  const { org } = Route.useParams()
  return <InboxPage org={org} />
}
