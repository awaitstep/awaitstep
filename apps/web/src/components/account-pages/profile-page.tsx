import { useAccount } from '../../data/dashboard/account'
import { PageBody } from '../shell/page-intro'
import { LoadedQuery } from '../workspaces/loaded-query'
import { AboutYouSection } from './about-you-section'
import { AccountHeader } from './account-header'
import { AccountOrgsSection } from './account-orgs-section'
import { YourDataSection } from './your-data-section'

/** `/{org}/account/profile` (`AccountProfile`): the same in every org. */
export function ProfilePage({ org }: { org: string }) {
  const account = useAccount()
  return (
    <PageBody>
      <AccountHeader org={org} page="profile" />
      <LoadedQuery query={account} what="your account">
        {(data) => (
          <>
            {/* Starts the name again from the saved one when `?as=` switches person. */}
            <AboutYouSection key={data.person.id} account={data} />
            <AccountOrgsSection currentOrg={org} orgs={data.orgs} />
            <YourDataSection account={data} currentOrg={org} />
          </>
        )}
      </LoadedQuery>
    </PageBody>
  )
}
