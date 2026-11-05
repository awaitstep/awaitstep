import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { DraftStorage, StoredDrafts } from '../../../lib/ide/draft-persistence'
import { useAuthStore } from '../../../stores/auth-store'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { createWorkspaceClient, WORKFLOW_ID } from '../../../__tests__/fixtures/workspace-queries'
import { IdeWorkspace } from '../ide-workspace'
import { ItemTestScope } from '../../../__tests__/fixtures/item-scope'

// The first save happens on the canvas, with this workspace closed: it is
// mounted again on the stale blank cache and the refetch then lands. Mounted with
// the real explorer, dock, status bar, side bar and Steps; only the editor
// (Monaco), the router and the network are stood in for.

const switchView = vi.hoisted(() => vi.fn())
const memory = vi.hoisted(() => ({ data: new Map<string, unknown>() }))

// The browser's draft store is the only thing stood in for: the persistence
// layer around it is the real one.
vi.mock('../../../lib/ide/draft-persistence', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const storage: DraftStorage = {
    get: async (key) => memory.data.get(key) as StoredDrafts | undefined,
    set: async (key, value) => void memory.data.set(key, value),
    del: async (key) => void memory.data.delete(key),
    keys: async () => [...memory.data.keys()],
  }
  return { ...actual, browserDraftStorage: storage }
})

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle', current: {}, next: {}, proceed: vi.fn(), reset: vi.fn() }),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../hooks/use-min-width', () => ({ useMinWidth: () => true }))
vi.mock('../../../hooks/use-workspace-problems', () => ({ useWorkspaceProblems: () => [] }))
vi.mock('../../../hooks/use-outside-changes', () => ({ useOutsideChanges: () => {} }))
vi.mock('../../../stores/org-store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOrgReady: () => true,
}))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { get: () => undefined } }),
}))
vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<{ api: object }>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getTestSession: vi.fn(() => Promise.resolve({ session: null })),
    },
  }
})
vi.mock('../editor-group', () => ({
  EditorGroup: ({ files }: { files: ReadonlyMap<string, { source: string }> }) => (
    <ul data-testid="editor-files">
      {[...files.keys()].map((path) => (
        <li key={path}>{path}</li>
      ))}
    </ul>
  ),
}))
vi.mock('../ide-header', () => ({
  IdeHeader: ({ version }: { version?: number }) => (
    <div data-testid="header">{version === undefined ? 'no version' : `v${version}`}</div>
  ),
}))
vi.mock('../search-runner', () => ({ SearchRunner: () => null }))
vi.mock('../canvas-preview', () => ({ CanvasPreview: () => null }))
vi.mock('../quick-open-dialog', () => ({ QuickOpenDialog: () => null }))

const FULL_KEY = ['workflow-full', WORKFLOW_ID, undefined]
const SOURCE_KEY = ['workflow-source', WORKFLOW_ID, undefined]

const blankFull = {
  workflow: { id: WORKFLOW_ID, name: 'Orders', kind: 'workflow', currentVersionId: null },
  version: null,
  versions: [],
  handlers: { modules: false, consumedQueues: [] },
  activeDeployment: null,
}
const blankSource = (files: object[] = []) => ({
  versionId: null,
  entry: null,
  primary: null,
  files,
  manifest: null,
  requirements: [],
  diagnostics: [],
})

const LIB_A = { path: 'lib/a.ts', source: 'export const a = 1\n', role: 'module', hash: 'h-a' }

beforeEach(() => {
  switchView.mockReset()
  useIdeLayoutStore.setState({
    explorerOpen: true,
    dockOpen: true,
    previewOpen: false,
    sideBarTab: 'explorer',
    dockTab: 'session',
  })
  useIdeStore.getState().resetSession()
  useWorkflowStore.getState().reset()
})
afterEach(() => useIdeStore.getState().resetSession())

const GENERATED = [
  { path: 'worker.ts', source: '// worker\n', role: 'entry' },
  { path: 'awaitstep/workflow.ts', source: '// wf\n', role: 'module' },
]

function renderWorkspace(client: ReturnType<typeof createWorkspaceClient>) {
  return render(
    <QueryClientProvider client={client}>
      <ItemTestScope>
        <IdeWorkspace workflowId={WORKFLOW_ID} />
      </ItemTestScope>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  memory.data.clear()
  useAuthStore.setState({ user: { id: 'u1' } as never })
  useIdeLayoutStore.setState({
    explorerOpen: true,
    dockOpen: true,
    previewOpen: false,
    sideBarTab: 'explorer',
    dockTab: 'session',
  })
  useIdeStore.getState().resetSession()
  useWorkflowStore.getState().reset()
})
afterEach(() => useIdeStore.getState().resetSession())

describe('the first save made while the workspace was closed', () => {
  it('opens the primary file, shows the generated files and restores the drafts when the refetch lands', async () => {
    const client = createWorkspaceClient()
    client.setQueryData(FULL_KEY, blankFull)
    client.setQueryData(SOURCE_KEY, blankSource([LIB_A]))

    // First visit: an unsaved edit, then the person goes to the canvas.
    const first = renderWorkspace(client)
    // Writes start once the stored drafts have been looked at.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    act(() => {
      useIdeStore.getState().openFile('lib/a.ts')
      useIdeStore.getState().setDraft('lib/a.ts', 'export const a = 2\n', 'h-a')
    })
    first.unmount()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    // The session is gone, as the app resets it on close; the draft is in storage.
    expect(useIdeStore.getState().openPaths).toEqual([])
    expect(memory.data.size).toBe(1)

    // Back to Code: the cache is still the blank one, then the refetch lands.
    const second = renderWorkspace(client)
    expect(second.getByTestId('editor-files')).not.toHaveTextContent('worker.ts')
    await act(async () => {
      client.setQueryData(FULL_KEY, {
        ...blankFull,
        workflow: { ...blankFull.workflow, currentVersionId: 'v-1' },
        version: { id: 'v-1', version: 1 },
        versions: [{ id: 'v-1', version: 1 }],
      })
      client.setQueryData(SOURCE_KEY, {
        versionId: 'v-1',
        entry: 'worker.ts',
        primary: 'awaitstep/workflow.ts',
        files: [...GENERATED, LIB_A],
        manifest: null,
        requirements: [],
        diagnostics: [],
      })
    })

    await waitFor(() =>
      expect(second.getByTestId('editor-files')).toHaveTextContent('awaitstep/workflow.ts'),
    )
    expect(second.getByTestId('editor-files')).toHaveTextContent('worker.ts')
    expect(second.getByTestId('header')).toHaveTextContent('v1')
    // The lifecycle opened the primary file now that there is one.
    await waitFor(() => expect(useIdeStore.getState().activePath).toBe('awaitstep/workflow.ts'))
    // The unsaved text came back through the real persistence layer.
    await waitFor(() =>
      expect(useIdeStore.getState().drafts['lib/a.ts']?.source).toBe('export const a = 2\n'),
    )
  })
})
