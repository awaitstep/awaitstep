import { useLocation } from '@tanstack/react-router'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { NotFoundView } from '../ui/not-found-view'

/**
 * A workflow this workspace URL can't show: gone, another workspace's, or a
 * sample item (`?mock=` / `?as=`), which has no backend to open.
 */
export function ItemNotFound({ slugs, workflowId }: { slugs: WorkspaceSlugs; workflowId: string }) {
  const { pathname } = useLocation()
  return (
    <NotFoundView
      kind="page"
      name={workflowId}
      path={pathname}
      primary={{ label: 'Back to the workspace', href: workspacePath(slugs) }}
    />
  )
}
