import { accountPath, type AccountPage } from '../../lib/dashboard-paths'
import { LinkTabs } from '../ui/link-tabs'
import { PageIntro } from '../shell/page-intro'

interface AccountHeaderProps {
  page: AccountPage
}

/** "Your account" and its Profile · Sessions and sign-in tabs, on both account pages. */
export function AccountHeader({ page }: AccountHeaderProps) {
  return (
    <>
      <PageIntro title="Your account" description="Applies to you across all organizations." />
      <LinkTabs
        label="Account sections"
        activeKey={page}
        tabs={[
          { key: 'profile', label: 'Profile', href: accountPath('profile') },
          { key: 'sessions', label: 'Sessions and sign-in', href: accountPath('sessions') },
        ]}
      />
    </>
  )
}
