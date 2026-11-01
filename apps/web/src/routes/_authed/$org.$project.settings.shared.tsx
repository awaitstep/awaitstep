import { createFileRoute, redirect } from '@tanstack/react-router'
import { projectPagePath } from '../../lib/dashboard-paths'

// Project pages left `/settings/` for `/{org}/{project}/shared`: old links follow, query kept, slugs encoded.
export const Route = createFileRoute('/_authed/$org/$project/settings/shared')({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      href: `${projectPagePath(params, 'shared')}${location.searchStr}`,
      replace: true,
    })
  },
})
