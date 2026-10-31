import { createFileRoute } from '@tanstack/react-router'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// The old Account page: Your account › Profile now (B10), the same in every org.
export const Route = createFileRoute('/_authed/account')({
  ssr: false,
  component: AccountRedirect,
})

function AccountRedirect() {
  return <LegacyRedirect page={{ account: 'profile' }} />
}
