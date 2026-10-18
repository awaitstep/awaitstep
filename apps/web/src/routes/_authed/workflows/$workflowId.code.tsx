import { createFileRoute, useParams, useSearch } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { ClientOnly } from '../../../components/canvas/client-only'
import { IdeSkeleton } from '../../../components/ide/ide-skeleton'
import { NodeRegistryProvider } from '../../../contexts/node-registry-context'

const LazyIdeWorkspace = lazy(() =>
  import('../../../components/ide/ide-workspace').then((m) => ({ default: m.IdeWorkspace })),
)

export const Route = createFileRoute('/_authed/workflows/$workflowId/code')({
  head: () => ({ meta: [{ title: 'Code | AwaitStep' }] }),
  component: CodeWorkspacePage,
  validateSearch: (search: Record<string, unknown>): { version?: string; file?: string } => ({
    version: typeof search.version === 'string' ? search.version : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
})

function CodeWorkspacePage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/code' })
  const { version, file } = useSearch({ from: '/_authed/workflows/$workflowId/code' })

  return (
    <NodeRegistryProvider>
      <ClientOnly fallback={<IdeSkeleton />}>
        <Suspense fallback={<IdeSkeleton />}>
          <LazyIdeWorkspace workflowId={workflowId} versionParam={version} fileParam={file} />
        </Suspense>
      </ClientOnly>
    </NodeRegistryProvider>
  )
}
