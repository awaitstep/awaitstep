import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/$org/account/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/account/profile', params: { org: params.org }, replace: true })
  },
})
