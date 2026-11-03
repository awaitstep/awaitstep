import { createFileRoute } from '@tanstack/react-router'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// The old Settings page (org name + projects list): Org Settings › General now,
// with projects on their own Projects page. Redirects like the other old pages.
export const Route = createFileRoute('/_authed/settings')({
  ssr: false,
  component: SettingsRedirect,
})

function SettingsRedirect() {
  return <LegacyRedirect page={{ settings: 'general' }} />
}
