import { accountPath, type AccountPage } from '../../lib/dashboard-paths'
import { LinkTabs } from '../ui/link-tabs'
import { PageIntro } from '../shell/page-intro'

interface AccountHeaderProps {
  org: string
  page: AccountPage
}

/** "Your account" and its Profile · Sessions and sign-in tabs, on both account pages. */
export function AccountHeader({ org, page }: AccountHeaderProps) {
  return (
    <>
      <PageIntro
        title="Your account"
        description="Yours alone, and the same in every organization you’re in."
      />
      <LinkTabs
        label="Account sections"
        activeKey={page}
        tabs={[
          { key: 'profile', label: 'Profile', href: accountPath(org, 'profile') },
          { key: 'sessions', label: 'Sessions and sign-in', href: accountPath(org, 'sessions') },
        ]}
      />
    </>
  )
}
