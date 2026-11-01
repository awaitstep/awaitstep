import { createFileRoute, redirect } from '@tanstack/react-router'
import { projectPagePath } from '../../lib/dashboard-paths'

// Workspaces is the project's own page: old links follow, query kept, slugs encoded.
export const Route = createFileRoute('/_authed/$org/$project/settings/workspaces')({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      href: `${projectPagePath(params, 'workspaces')}${location.searchStr}`,
      replace: true,
    })
  },
})
