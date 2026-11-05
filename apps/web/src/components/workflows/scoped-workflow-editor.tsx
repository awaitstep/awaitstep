import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { EditorScopeProvider } from '../../contexts/editor-scope-context'
import { useDataSource } from '../../data/dashboard/source'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { routeScopeKey } from '../../lib/workflows/route-scope'
import type { EditorRouteSearch } from '../../lib/workflows/surfaces'
import { useOrgStore } from '../../stores/org-store'
import { CanvasSkeleton } from '../canvas/canvas-skeleton'
import { IdeSkeleton } from '../ide/ide-skeleton'
import { ItemPlaceholder } from '../navigation/item-placeholder'
import { PageBody } from '../shell/page-intro'
import { LoadError } from '../ui/load-error'
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
 * workflow through whichever project the old switcher had picked.
 */
export function ScopedWorkflowEditor({
  slugs,
  workflowId,
  search,
  localDev,
}: ScopedWorkflowEditorProps) {
  const source = useDataSource()
  const key = routeScopeKey(slugs)
  const ready = useOrgStore((s) => s.appReady && s.routeScope?.key === key)

  if (source !== 'api') return <ItemPlaceholder slugs={slugs} itemId={workflowId} />
  if (!ready) return search.view === 'ide' ? <IdeSkeleton /> : <CanvasSkeleton />
  return (
    <EditorScopeProvider value={slugs}>
      <WorkflowEditor workflowId={workflowId} search={search} localDev={localDev} />
    </EditorScopeProvider>
  )
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
