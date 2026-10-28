import { createFileRoute } from '@tanstack/react-router'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// The old dashboard: its stats, workflow list and recent runs live on the
// workspace Overview now, and projects on the org home.
export const Route = createFileRoute('/_authed/dashboard')({
  ssr: false,
  component: DashboardRedirect,
})

function DashboardRedirect() {
  return <LegacyRedirect page={null} />
}
