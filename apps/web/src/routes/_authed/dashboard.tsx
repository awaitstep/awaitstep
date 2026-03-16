import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Loader2, Workflow, Cable, Cloud, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api-client'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: workflows, isLoading: wfLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
    retry: false,
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
    retry: false,
  })

  const { data: recentDeployments } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: () => api.listAllDeployments(),
    retry: false,
  })

  const deployedCount = workflows?.filter((w) => w.currentVersionId).length ?? 0
  const workflowMap = new Map(workflows?.map((w) => [w.id, w]) ?? [])

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Workflow} value={workflows?.length ?? 0} label="Workflows" loading={wfLoading} />
        <StatCard icon={Workflow} value={deployedCount} label="Deployed" loading={wfLoading} />
        <StatCard icon={Cable} value={connections?.length ?? 0} label="Connections" />
      </div>

      {/* Workflows */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workflows</h2>
          <Link to="/workflows/$workflowId" params={{ workflowId: 'new' }}>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Workflow
            </Button>
          </Link>
        </div>

        {wfLoading && (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {workflows && workflows.length === 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No workflows yet. Create your first one to get started.</p>
          </div>
        )}

        {workflows && workflows.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                to="/workflows/$workflowId"
                params={{ workflowId: wf.id }}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-card/80"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Workflow className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                      {wf.name}
                    </h3>
                    {wf.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{wf.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{new Date(wf.updatedAt).toLocaleDateString()}</span>
                      {wf.currentVersionId && (
                        <Link
                          to="/workflows/$workflowId/deployments"
                          params={{ workflowId: wf.id }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded bg-emerald-500/10 px-1 py-0.5 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          deployed
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Deployments */}
      {recentDeployments && recentDeployments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Recent Deployments</h2>
          <div className="mt-4 space-y-px">
            {recentDeployments.slice(0, 8).map((d) => {
              const wf = workflowMap.get(d.workflowId)
              return (
                <Link
                  key={d.id}
                  to="/workflows/$workflowId/deployments"
                  params={{ workflowId: d.workflowId }}
                  className="flex items-center gap-4 border border-border bg-card px-4 py-3 first:rounded-t-lg last:rounded-b-lg -mt-px first:mt-0 hover:bg-card/80 transition-colors"
                >
                  {d.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {wf && <span className="text-sm font-medium truncate">{wf.name}</span>}
                      <span className="font-mono text-xs text-muted-foreground truncate">{d.workerName}</span>
                    </div>
                    {d.workerUrl && (
                      <p className="text-xs text-muted-foreground truncate">{d.workerUrl.replace('https://', '')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                    {new Date(d.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Connections */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connections</h2>
          <Link to="/connections">
            <Button variant="ghost" size="sm" className="text-xs">
              Manage
            </Button>
          </Link>
        </div>

        {connections && connections.length === 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No connections yet. Add one to deploy workflows.</p>
            <Link to="/connections" className="mt-3 inline-block">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Connection
              </Button>
            </Link>
          </div>
        )}

        {connections && connections.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                    <Cloud className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{conn.name}</h3>
                    <p className="text-xs text-muted-foreground">Cloudflare</p>
                  </div>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground">{conn.accountId}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  value,
  label,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="mt-3 h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <span className="mt-2 block text-3xl font-bold">{value}</span>
      )}
    </div>
  )
}
