import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useDataSource } from '../../data/dashboard/source'
import { useInOtherWorkspace, useItemScopeReady } from '../../lib/workflows/route-scope'
import type { EditorRouteSearch } from '../../lib/workflows/surfaces'
import { CanvasSkeleton } from '../canvas/canvas-skeleton'
import { IdeSkeleton } from '../ide/ide-skeleton'
import { PageBody } from '../shell/page-intro'
import { LoadError } from '../ui/load-error'
import { ItemNotFound } from '../workflow-detail/item-not-found'
import { useScopedWorkflow } from '../workflow-detail/use-scoped-workflow'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { WorkflowEditor } from './workflow-editor'

interface ScopedWorkflowEditorProps {
  slugs: WorkspaceSlugs
  workflowId: string
  search: EditorRouteSearch
  localDev: boolean
}

/**
 * The editor at a workspace's URL. Its calls go to the project the URL names
 * (the route resolves it before rendering), never the old switcher's. Its
 * workspace comes from the item's layout (`ItemScopeLayout`).
 */
export function ScopedWorkflowEditor({
  slugs,
  workflowId,
  search,
  localDev,
}: ScopedWorkflowEditorProps) {
  const source = useDataSource()
  const ready = useItemScopeReady()
  const workflow = useScopedWorkflow(workflowId, source === 'api')
  const inOtherWorkspace = useInOtherWorkspace(workflow.data)

  // Sample items have no backend to open.
  if (source !== 'api') {
    return (
      <PageBody>
        <ItemNotFound slugs={slugs} workflowId={workflowId} />
      </PageBody>
    )
  }
  // A cached read naming another workspace may be from before a move: wait for the fresh one.
  if (!ready || (inOtherWorkspace && workflow.isFetching)) {
    return search.view === 'ide' ? <IdeSkeleton /> : <CanvasSkeleton />
  }
  if (inOtherWorkspace) {
    return (
      <PageBody>
        <ItemNotFound slugs={slugs} workflowId={workflowId} />
      </PageBody>
    )
  }
  return <WorkflowEditor workflowId={workflowId} search={search} localDev={localDev} />
}

/** The editor route's error page: its scope lookup failed. */
export function EditorScopeError() {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  function handleRetry() {
    setRetrying(true)
    void router.invalidate().finally(() => setRetrying(false))
  }

  return (
    <PageBody>
      <LoadError
        title="We couldn’t open this workflow"
        detail="Something went wrong while looking up its workspace. Nothing was changed."
        onRetry={handleRetry}
        retrying={retrying}
      />
    </PageBody>
  )
}
