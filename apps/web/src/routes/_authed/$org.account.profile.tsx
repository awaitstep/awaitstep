import { createFileRoute, redirect } from '@tanstack/react-router'

// Account is top-level now (`/account/profile`): keep stale `/{org}/account/profile` links working.
export const Route = createFileRoute('/_authed/$org/account/profile')({
  beforeLoad: () => {
    throw redirect({ to: '/account/profile', replace: true })
  },
})
