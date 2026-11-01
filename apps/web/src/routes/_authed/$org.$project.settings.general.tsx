import { createFileRoute, redirect } from '@tanstack/react-router'
import { projectPagePath } from '../../lib/dashboard-paths'

// General is the project's Settings now: old links follow, query kept, slugs encoded.
export const Route = createFileRoute('/_authed/$org/$project/settings/general')({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      href: `${projectPagePath(params, 'settings')}${location.searchStr}`,
      replace: true,
    })
  },
})
