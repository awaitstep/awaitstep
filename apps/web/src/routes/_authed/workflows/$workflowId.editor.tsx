import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { lazy, Suspense } from 'react'
import { CanvasView } from '../../../components/canvas/canvas-view'
import { ClientOnly } from '../../../components/canvas/client-only'
import { IdeSkeleton } from '../../../components/ide/ide-skeleton'
import { NodeRegistryProvider } from '../../../contexts/node-registry-context'
import { parseSurface, type WorkspaceSurface } from '../../../lib/workflows/surfaces'

const LazyIdeWorkspace = lazy(() =>
  import('../../../components/ide/ide-workspace').then((m) => ({ default: m.IdeWorkspace })),
)

const getCanvasContext = createServerFn({ method: 'GET' }).handler(async () => ({
  localDev: process.env['ENABLE_LOCAL_DEV'] === 'true',
}))

interface EditorSearchParams {
  view: WorkspaceSurface
  version?: string
  file?: string
  template?: boolean
  kind?: 'workflow' | 'script'
}

// Canvas and Code are one editor: switching views changes `view` in place
// (a replace navigation), so this route stays mounted and history gains no
// entry. See useSwitchView.
export const Route = createFileRoute('/_authed/workflows/$workflowId/editor')({
  head: () => ({ meta: [{ title: 'Editor | AwaitStep' }] }),
  component: EditorPage,
  loader: () => getCanvasContext(),
  // The flag is fixed for the server's lifetime; a view switch must not refetch it.
  staleTime: Infinity,
  validateSearch: (search: Record<string, unknown>): EditorSearchParams => ({
    view: parseSurface(search.view),
    version: typeof search.version === 'string' ? search.version : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
    template:
      search.template === true || search.template === '1' || search.template === 'true'
        ? true
        : undefined,
    kind: search.kind === 'script' || search.kind === 'workflow' ? search.kind : undefined,
  }),
})

function EditorPage() {
  const { workflowId } = Route.useParams()
  const { view, version, file, template, kind } = Route.useSearch()
  const { localDev } = Route.useLoaderData()

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
          localDevEnabled={localDev}
        />
      )}
    </NodeRegistryProvider>
  )
}
