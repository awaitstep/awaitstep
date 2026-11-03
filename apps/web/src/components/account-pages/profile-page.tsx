import { useAccount } from '../../data/dashboard/account'
import { PageBody } from '../shell/page-intro'
import { LoadedQuery } from '../workspaces/loaded-query'
import { AboutYouSection } from './about-you-section'
import { AccountHeader } from './account-header'
import { AccountOrgsSection } from './account-orgs-section'
import { YourDataSection } from './your-data-section'

/**
 * `/account/profile` (`AccountProfile`): the same in every org. `currentOrg` is
 * the org whose rail frames this page — where "leave" and account deletion land.
 */
export function ProfilePage({ currentOrg }: { currentOrg: string }) {
  const account = useAccount()
  return (
    <PageBody>
      <AccountHeader page="profile" />
      <LoadedQuery query={account} what="your account">
        {(data) => (
          <>
            {/* Starts the name again from the saved one when `?as=` switches person. */}
            <AboutYouSection key={data.person.id} account={data} />
            <AccountOrgsSection currentOrg={currentOrg} orgs={data.orgs} />
            <YourDataSection account={data} currentOrg={currentOrg} />
          </>
        )}
      </LoadedQuery>
    </PageBody>
  )
}
