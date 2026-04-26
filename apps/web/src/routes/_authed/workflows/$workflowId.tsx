import { createFileRoute, Outlet, Link, useMatches, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { api } from '../../../lib/api-client'
import { RequireProject } from '../../../wrappers/require-project'
import { cn } from '../../../lib/utils'

export const Route = createFileRoute('/_authed/workflows/$workflowId')({
  component: WorkflowLayout,
})

const getTabs = (currentRouteId: string, kind: 'workflow' | 'script' | undefined) => {
  const tabs = [
    {
      to: '/workflows/$workflowId',
      label: 'Overview',
      active: currentRouteId === '/_authed/workflows/$workflowId/',
    },
  ]
  // Scripts are stateless fetch-only Workers — they have no instance lifecycle,
  // so there are no runs to show.
  if (kind !== 'script') {
    tabs.push({
      to: '/workflows/$workflowId/runs',
      label: 'Runs',
      active: currentRouteId.startsWith('/_authed/workflows/$workflowId/runs'),
    })
  }
  tabs.push({
    to: '/workflows/$workflowId/deployments',
    label: 'Deployments',
    active: currentRouteId === '/_authed/workflows/$workflowId/deployments',
  })
  return tabs
}

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

  const isFullScreen = matches.some(
    (m) =>
      m.routeId === '/_authed/workflows/$workflowId/canvas' ||
      m.routeId === '/_authed/workflows/$workflowId/deploy',
  )

  if (isFullScreen) {
    return <Outlet />
  }

  const currentRouteId = matches[matches.length - 1]?.routeId ?? ''

  const tabs = getTabs(currentRouteId, workflow?.kind)

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground/60">
        <Link to="/workflows" className="transition-colors hover:text-muted-foreground">
          Workflows
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="max-w-[200px] truncate text-muted-foreground">
          {workflow?.name ?? workflowId}
        </span>
        {workflow?.kind === 'script' && (
          <span
            className="ml-1 inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            title="Stateless fetch-only Worker — runs synchronously, no sleeps or waits"
          >
            Function
          </span>
        )}
      </nav>
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
