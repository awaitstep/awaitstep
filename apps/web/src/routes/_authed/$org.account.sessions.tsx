import { createFileRoute, redirect } from '@tanstack/react-router'

// Account is top-level now (`/account/sessions`): keep stale `/{org}/account/sessions` links working.
export const Route = createFileRoute('/_authed/$org/account/sessions')({
  beforeLoad: () => {
    throw redirect({ to: '/account/sessions', replace: true })
  },
})
