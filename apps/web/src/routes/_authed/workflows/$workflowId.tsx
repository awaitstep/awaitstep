import { createFileRoute, Outlet, Link, useMatches, useParams } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/_authed/workflows/$workflowId')({
  component: WorkflowLayout,
})

function WorkflowLayout() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId' })
  const matches = useMatches()

  const isFullScreen = matches.some(
    (m) => m.routeId === '/_authed/workflows/$workflowId/canvas',
  )

  if (isFullScreen) {
    return <Outlet />
  }

  const currentRouteId = matches[matches.length - 1]?.routeId ?? ''

  const tabs = [
    {
      to: '/workflows/$workflowId' as const,
      label: 'Overview',
      active: currentRouteId === '/_authed/workflows/$workflowId/',
    },
    {
      to: '/workflows/$workflowId/runs' as const,
      label: 'Runs',
      active: currentRouteId.startsWith('/_authed/workflows/$workflowId/runs'),
    },
    {
      to: '/workflows/$workflowId/deployments' as const,
      label: 'Deployments',
      active: currentRouteId === '/_authed/workflows/$workflowId/deployments',
    },
  ]

  return (
    <div>
      <div className="flex items-center gap-1 px-4 pt-4 text-xs text-muted-foreground/60">
        <Link to="/dashboard" className="hover:text-muted-foreground">Dashboard</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-muted-foreground">Workflows</span>
      </div>
      <nav className="mt-3 flex gap-0 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ workflowId }}
            className={`relative px-4 py-2.5 text-sm transition-colors ${
              tab.active
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {tab.label}
            {tab.active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </Link>
        ))}
      </nav>
      <div className="mx-auto max-w-screen-md pt-6">
        <Outlet />
      </div>
    </div>
  )
}
