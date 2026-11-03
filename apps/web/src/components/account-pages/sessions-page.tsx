import { PageBody } from '../shell/page-intro'
import { AccountHeader } from './account-header'
import { SessionsSection } from './sessions-section'
import { SignInMethodsSection } from './sign-in-methods-section'

/** `/account/sessions` (`AccountSessions`): sign-in methods and active sessions. */
export function SessionsPage({ linkError }: { linkError?: string }) {
  return (
    <PageBody>
      <AccountHeader page="sessions" />
      <SignInMethodsSection linkError={linkError} />
      <SessionsSection />
    </PageBody>
  )
}
