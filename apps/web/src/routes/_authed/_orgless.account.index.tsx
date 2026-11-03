import { createFileRoute, redirect } from '@tanstack/react-router'

// Bare /account opens your profile.
export const Route = createFileRoute('/_authed/_orgless/account/')({
  beforeLoad: () => {
    throw redirect({ to: '/account/profile', replace: true })
  },
})
