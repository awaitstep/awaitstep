import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Search, Upload, Workflow } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Button } from '../../components/ui/button'
import { GuardedLink } from '../../components/ui/guarded-link'
import { PageHeader } from '../../components/ui/page-header'
import type { WorkflowSummary } from '../../lib/api-client'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { WorkflowActionsMenu } from '../../components/dashboard/workflow-actions-menu'
import { TriggerButton } from '../../components/dashboard/trigger-button'
import { ImportWorkflowDialog } from '../../components/dashboard/import-workflow-dialog'
import { NewArtifactDropdown } from '../../components/dashboard/new-artifact-dropdown'
import { timeAgo } from '../../lib/time'
import { RequireProject } from '../../wrappers/require-project'
import { NEW_WORKFLOW_NAV } from '../../lib/nav'
import { LoadingView } from '../../components/ui/loading-view'
import { LoadMoreButton } from '../../components/ui/load-more-button'
import { ListSkeleton } from '../../components/ui/skeletons'
import { EmptyState } from '../../components/ui/empty-state'

export const Route = createFileRoute('/_authed/workflows/')({
  head: () => ({ meta: [{ title: 'Workflows | AwaitStep' }] }),
  component: WorkflowsIndexPage,
})

function WorkflowsIndexPage() {
  return (
    <RequireProject>
      <WorkflowsIndexContent />
    </RequireProject>
  )
}

function WorkflowsIndexContent() {
  const workflows = useWorkflowsStore((s) => s.workflows)
  const isLoading = useWorkflowsStore((s) => s.fetchState === 'idle' || s.fetchState === 'loading')
  const hasMore = useWorkflowsStore((s) => s.hasMore)
  const loadMore = useWorkflowsStore((s) => s.loadMore)
  const isFetchingMore = useWorkflowsStore((s) => s.isFetchingMore)
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return workflows
    const q = search.toLowerCase()
    return workflows.filter(
      (wf) => wf.name.toLowerCase().includes(q) || wf.description?.toLowerCase().includes(q),
    )
  }, [workflows, search])

  return (
    <div>
      <PageHeader
        title="Workflows"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Workflows' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <NewArtifactDropdown />
          </div>
        }
      />

      <div>
        {workflows.length > 0 && (
          <div className="relative mt-6 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-border"
            />
          </div>
        )}

        <LoadingView isLoading={isLoading} LoadingPlaceholder={ListSkeleton}>
          {workflows.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Workflow}
                title="No workflows yet"
                description="Create your first visual workflow and deploy it to Cloudflare Workers."
                action={
                  <Button size="sm" className="gap-1.5" asChild>
                    <GuardedLink requirement="project" nav={NEW_WORKFLOW_NAV}>
                      <Plus className="h-4 w-4" />
                      New Workflow
                    </GuardedLink>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {filtered.map((wf) => (
                <WorkflowRow key={wf.id} workflow={wf} />
              ))}
              {!search && (
                <LoadMoreButton
                  hasMore={hasMore}
                  loading={isFetchingMore}
                  onClick={() => loadMore?.()}
                />
              )}
            </div>
          )}
        </LoadingView>

        {search && filtered.length === 0 && workflows.length > 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No workflows match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {importOpen && <ImportWorkflowDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}

function WorkflowRow({ workflow: wf }: { workflow: WorkflowSummary }) {
  return (
    <Link
      to="/workflows/$workflowId"
      params={{ workflowId: wf.id }}
      className="group block rounded-lg border border-border bg-card transition-all duration-150 hover:border-border/80 hover:bg-muted/20"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-foreground">{wf.name}</span>
            {wf.kind === 'script' && (
              <span
                className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                title="Stateless fetch-only Worker — runs synchronously, no sleeps or waits"
              >
                Function
              </span>
            )}
            <StatusLabel
              hasVersion={!!wf.currentVersionId}
              deployStatus={wf.deployStatus ?? undefined}
            />
          </div>
          {wf.description && (
            <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground/60">
              {wf.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.preventDefault()}>
          <span className="text-xs text-muted-foreground">{timeAgo(wf.updatedAt)}</span>
          <div className="flex items-center gap-1">
            {wf.deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
            <WorkflowActionsMenu workflow={wf} isDeployed={wf.deployStatus === 'success'} />
          </div>
        </div>
      </div>
    </Link>
  )
}

function StatusLabel({ hasVersion, deployStatus }: { hasVersion: boolean; deployStatus?: string }) {
  if (hasVersion && deployStatus === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success">
        <span className="h-1.5 w-1.5 rounded-full bg-status-success" /> Deployed
      </span>
    )
  }
  if (deployStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-error">
        <span className="h-1.5 w-1.5 rounded-full bg-status-error" /> Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
      <span className="h-1.5 w-1.5 rounded-full border border-border" /> Draft
    </span>
  )
}
