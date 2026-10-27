import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/$org/$project/$workspace/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/$project/$workspace/workflows', params: params, replace: true })
  },
})
