import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/$org/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/projects', params: { org: params.org }, replace: true })
  },
})
