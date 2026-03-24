import { createFileRoute, Outlet, Link, useMatches, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Breadcrumb } from '../../../components/ui/breadcrumb'
import { api } from '../../../lib/api-client'
import { RequireProject } from '../../../wrappers/require-project'
import { cn } from '../../../lib/utils'

export const Route = createFileRoute('/_authed/workflows/$workflowId')({
  component: WorkflowLayout,
})

const getTabs = (currentRouteId: string) => [
  {
    to: '/workflows/$workflowId',
    label: 'Overview',
    active: currentRouteId === '/_authed/workflows/$workflowId/',
  },
  {
    to: '/workflows/$workflowId/runs',
    label: 'Runs',
    active: currentRouteId.startsWith('/_authed/workflows/$workflowId/runs'),
  },
  {
    to: '/workflows/$workflowId/deployments',
    label: 'Deployments',
    active: currentRouteId === '/_authed/workflows/$workflowId/deployments',
  },
]

function WorkflowLayout() {
  return (
    <RequireProject>
      <WorkflowLayoutContent />
    </RequireProject>
  )
}

function WorkflowLayoutContent() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId' })
  const matches = useMatches()
  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  })

  const isFullScreen = matches.some((m) => m.routeId === '/_authed/workflows/$workflowId/canvas')

  if (isFullScreen) {
    return <Outlet />
  }

  const currentRouteId = matches[matches.length - 1]?.routeId ?? ''

  const tabs = getTabs(currentRouteId)

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Workflows', href: '/workflows' },
          { label: workflow?.name ?? workflowId },
        ]}
      />
      <nav className="flex gap-0 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ workflowId }}
            className={cn(
              'relative px-4 py-2.5 text-sm transition-colors',
              tab.active
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground/70',
            )}
          >
            {tab.label}
            {tab.active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </Link>
        ))}
      </nav>
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  )
}
