import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '../../stores/auth-store'
import { ProfileSection } from '../../components/account/profile-section'
import { ConnectedAccountsSection } from '../../components/account/connected-accounts-section'
import { SessionsSection } from '../../components/account/sessions-section'
import { DataPrivacySection } from '../../components/account/data-privacy-section'

export const Route = createFileRoute('/_authed/account')({
  component: AccountPage,
})

function AccountPage() {
  const user = useAuthStore((s) => s.user)
  const session = useAuthStore((s) => s.session)

  if (!user || !session) {
    return (
      <div className="mt-12 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="border-b border-border pb-4 text-lg font-semibold">Account</h1>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ProfileSection user={user} />
          <ConnectedAccountsSection />
          <SessionsSection currentSessionToken={session.token} />
        </div>
        <div className="space-y-4">
          <DataPrivacySection />
        </div>
      </div>
    </div>
  )
}
