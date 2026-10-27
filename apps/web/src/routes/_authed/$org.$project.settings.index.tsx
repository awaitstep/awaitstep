import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/$org/$project/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$org/$project/settings/workspaces',
      params: { org: params.org, project: params.project },
      replace: true,
    })
  },
})
