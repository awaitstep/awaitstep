import { createFileRoute, redirect } from '@tanstack/react-router'
import { InboxPage } from '../../components/inbox/inbox-page'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { isPhoneLayout } from '../../lib/phone-layout'

const page: DashboardPage = { kind: 'org', page: 'inbox' }

// On a phone the tab bar's Inbox is this page, in the frame. Wider, the
// Inbox is the overlay beside the rail (D-P8-1): this URL opens it over
// Projects, so old links keep working.
export const Route = createFileRoute('/_authed/$org/inbox')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  beforeLoad: ({ params, search }) => {
    if (isPhoneLayout()) return
    throw redirect({
      to: '/$org/projects',
      params,
      search: { ...search, open: 'inbox' },
      replace: true,
    })
  },
  component: OrgInboxPage,
})

function OrgInboxPage() {
  const { org } = Route.useParams()
  return <InboxPage org={org} />
}
