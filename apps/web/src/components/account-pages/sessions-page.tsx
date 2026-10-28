import { PageBody } from '../shell/page-intro'
import { AccountHeader } from './account-header'
import { SessionsSection } from './sessions-section'
import { SignInMethodsSection } from './sign-in-methods-section'

/** `/{org}/account/sessions` (`AccountSessions`): sign-in methods and active sessions. */
export function SessionsPage({ org }: { org: string }) {
  return (
    <PageBody>
      <AccountHeader org={org} page="sessions" />
      <SignInMethodsSection />
      <SessionsSection />
    </PageBody>
  )
}
