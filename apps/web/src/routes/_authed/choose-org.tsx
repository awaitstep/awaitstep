import { createFileRoute, redirect } from '@tanstack/react-router'
import { validateDashboardSearch } from '../../components/navigation/dashboard-providers'

// Retired: /dashboard lists your organizations now. Old links (and ?new=org) still land there.
export const Route = createFileRoute('/_authed/choose-org')({
  validateSearch: validateDashboardSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/dashboard', search, replace: true })
  },
})
