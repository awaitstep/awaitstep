import { createFileRoute, redirect } from '@tanstack/react-router'
import { projectPagePath } from '../../lib/dashboard-paths'

// Project pages left `/settings/` for `/{org}/{project}/api-keys`: old links follow, query kept, slugs encoded.
export const Route = createFileRoute('/_authed/$org/$project/settings/api-keys')({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      href: `${projectPagePath(params, 'api-keys')}${location.searchStr}`,
      replace: true,
    })
  },
})
