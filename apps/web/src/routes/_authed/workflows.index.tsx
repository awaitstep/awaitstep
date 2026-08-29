import { createFileRoute } from '@tanstack/react-router'
import { Plus, Search, Upload, Workflow } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Button } from '../../components/ui/button'
import { GuardedLink } from '../../components/ui/guarded-link'
import { PageHeader } from '../../components/ui/page-header'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { ImportWorkflowDialog } from '../../components/dashboard/import-workflow-dialog'
import { NewArtifactDropdown } from '../../components/dashboard/new-artifact-dropdown'
import { WorkflowListHeader, WorkflowRow } from '../../components/workflows/workflow-row'
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
          <div className="relative mt-4 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-transparent pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring/50"
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
            <>
              <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                <WorkflowListHeader />
                {filtered.map((wf) => (
                  <WorkflowRow key={wf.id} workflow={wf} />
                ))}
              </div>
              {!search && (
                <LoadMoreButton
                  hasMore={hasMore}
                  loading={isFetchingMore}
                  onClick={() => loadMore?.()}
                />
              )}
            </>
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
