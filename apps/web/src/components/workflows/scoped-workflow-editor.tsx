import { useState } from 'react'
import { useLocation, useRouter } from '@tanstack/react-router'
import { useDataSource } from '../../data/dashboard/source'
import { useInOtherWorkspace, useRouteScopeReady } from '../../lib/workflows/route-scope'
import type { EditorRouteSearch } from '../../lib/workflows/surfaces'
import { CanvasSkeleton } from '../canvas/canvas-skeleton'
import { IdeSkeleton } from '../ide/ide-skeleton'
import { ItemPlaceholder } from '../navigation/item-placeholder'
import { PageBody } from '../shell/page-intro'
import { LoadError } from '../ui/load-error'
import { NotFoundView } from '../ui/not-found-view'
import { useScopedWorkflow } from '../workflow-detail/use-scoped-workflow'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { WorkflowEditor } from './workflow-editor'

interface ScopedWorkflowEditorProps {
  slugs: WorkspaceSlugs
  workflowId: string
  search: EditorRouteSearch
  localDev: boolean
}

/**
 * The editor at a workspace's URL. It opens only once API calls follow this
 * workspace's project (the route waits for that), so it never loads a
 * workflow through whichever project the old switcher had picked. Its
 * workspace comes from the item's layout (`ItemScopeLayout`).
 */
export function ScopedWorkflowEditor({
  slugs,
  workflowId,
  search,
  localDev,
}: ScopedWorkflowEditorProps) {
  const source = useDataSource()
  const ready = useRouteScopeReady(slugs)
  const workflow = useScopedWorkflow(slugs, workflowId, source === 'api')
  const inOtherWorkspace = useInOtherWorkspace(workflow.data)
  const { pathname } = useLocation()

  if (source !== 'api') return <ItemPlaceholder slugs={slugs} itemId={workflowId} />
  // A cached read naming another workspace may be from before a move: wait for the fresh one.
  if (!ready || (inOtherWorkspace && workflow.isFetching)) {
    return search.view === 'ide' ? <IdeSkeleton /> : <CanvasSkeleton />
  }
  if (inOtherWorkspace) {
    return (
      <PageBody>
        <NotFoundView
          kind="page"
          name={workflowId}
          path={pathname}
          primary={{ label: 'Back to the workspace', href: workspacePath(slugs) }}
        />
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
