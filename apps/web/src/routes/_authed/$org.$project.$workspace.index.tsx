import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_WORKSPACE_PAGE } from '../../lib/dashboard-paths'

export const Route = createFileRoute('/_authed/$org/$project/$workspace/')({
  // The workspace's default page, where every card and switcher links too.
  beforeLoad: ({ params }) => {
    throw redirect({
      to: `/$org/$project/$workspace/${DEFAULT_WORKSPACE_PAGE}`,
      params,
      replace: true,
    })
  },
})
