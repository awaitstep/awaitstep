import { createFileRoute, redirect } from '@tanstack/react-router'
import { projectWorkspacesPath } from '../../lib/dashboard-paths'

// `/{org}/{project}` is no page of its own: it goes on to the project's Workspaces page,
// with its query (`?new=workspace` opens New workspace there).
export const Route = createFileRoute('/_authed/$org/$project/')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `${projectWorkspacesPath(params)}${location.searchStr}`, replace: true })
  },
})
