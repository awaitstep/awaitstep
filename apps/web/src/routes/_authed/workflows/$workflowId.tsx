import { createFileRoute, Outlet, Link, useMatches, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

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
      <nav className="flex gap-0 border-b border-border">
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
        <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground">
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
        <Outlet />
      </div>
    </div>
  )
}
