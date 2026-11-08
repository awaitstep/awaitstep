import { lazy, Suspense } from 'react'
import { CanvasView } from '../canvas/canvas-view'
import { ClientOnly } from '../canvas/client-only'
import { IdeSkeleton } from '../ide/ide-skeleton'
import { NodeRegistryProvider } from '../../contexts/node-registry-context'
import type { EditorRouteSearch } from '../../lib/workflows/surfaces'

const LazyIdeWorkspace = lazy(() =>
  import('../ide/ide-workspace').then((m) => ({ default: m.IdeWorkspace })),
)

interface WorkflowEditorProps {
  workflowId: string
  search: EditorRouteSearch
  localDev: boolean
}

/** The workflow editor, on its Canvas or Code view, whichever route opened it. */
export function WorkflowEditor({ workflowId, search, localDev }: WorkflowEditorProps) {
  const { view, version, file, node, template, kind, open } = search
  return (
    <NodeRegistryProvider>
      {view === 'ide' ? (
        <ClientOnly fallback={<IdeSkeleton />}>
          <Suspense fallback={<IdeSkeleton />}>
            <LazyIdeWorkspace workflowId={workflowId} versionParam={version} fileParam={file} />
          </Suspense>
        </ClientOnly>
      ) : (
        <CanvasView
          workflowId={workflowId}
          versionParam={version}
          template={template}
          kindParam={kind}
          nodeParam={node}
          marketplaceOpen={open === 'marketplace'}
          localDevEnabled={localDev}
        />
      )}
    </NodeRegistryProvider>
  )
}
