import { createFileRoute, redirect } from '@tanstack/react-router'

// Account moved out from under the org (it's the same in every org): a stale
// `/{org}/account` lands on the top-level profile now.
export const Route = createFileRoute('/_authed/$org/account/')({
  beforeLoad: () => {
    throw redirect({ to: '/account/profile', replace: true })
  },
})
