import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/$org/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/settings/general', params: { org: params.org }, replace: true })
  },
})
