import { createFileRoute, Outlet, Link, useMatches, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../../../components/ui/badge'
import { api } from '../../../lib/api-client'
import { isChromelessRoute } from '../../../lib/shell-routes'
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

  if (isChromelessRoute(matches)) {
    return <Outlet />
  }

  const currentRouteId = matches[matches.length - 1]?.routeId ?? ''

  const tabs = getTabs(currentRouteId, workflow?.kind)

  return (
    <div>
      <div className="-mx-6 flex h-16 shrink-0 items-center border-b border-border px-6 md:-mx-8 md:px-8">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground/60">
            <Link to="/workflows" className="transition-colors hover:text-muted-foreground">
              Workflows
            </Link>
            <span className="text-muted-foreground/40">/</span>
          </span>
          <h1 className="max-w-[280px] truncate text-base font-semibold tracking-tight">
            {workflow?.name ?? workflowId}
          </h1>
          {workflow?.kind === 'script' && (
            <Badge
              variant="outline"
              className="uppercase tracking-wide"
              title="Stateless fetch-only Worker — runs synchronously, no sleeps or waits"
            >
              Function
            </Badge>
          )}
        </div>
      </div>
      <nav className="-mx-6 flex gap-0 border-b border-border px-4 md:-mx-8 md:px-6">
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
