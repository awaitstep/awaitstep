import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { createWorkspaceClient, WORKFLOW_ID } from '../../../__tests__/fixtures/workspace-queries'
import { IdeWorkspace } from '../ide-workspace'

// The workspace for a workflow nobody has saved on the canvas, mounted with
// the real explorer, dock, status bar, side bar and Steps; only the editor
// (Monaco), the router and the network are stood in for.

const switchView = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle', current: {}, next: {}, proceed: vi.fn(), reset: vi.fn() }),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../hooks/use-min-width', () => ({ useMinWidth: () => true }))
vi.mock('../../../hooks/use-workspace-problems', () => ({ useWorkspaceProblems: () => [] }))
vi.mock('../../../hooks/use-draft-persistence', () => ({ useDraftPersistence: () => {} }))
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
      startTestSession: vi.fn(() => Promise.resolve({})),
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

function mountBlank(files: object[] = []) {
  const client = createWorkspaceClient()
  client.setQueryData(FULL_KEY, blankFull)
  client.setQueryData(SOURCE_KEY, blankSource(files))
  const view = render(
    <QueryClientProvider client={client}>
      <IdeWorkspace workflowId={WORKFLOW_ID} />
    </QueryClientProvider>,
  )
  return { client, ...view }
}

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

describe('IdeWorkspace with no saved version', () => {
  it('opens the project tree, not a notice, and lands on no generated file', () => {
    mountBlank([LIB_A])
    expect(screen.queryByText(/no saved version yet/)).toBeNull()
    const tree = screen.getByRole('tree', { name: 'Project files' })
    expect(within(tree).getByRole('treeitem', { name: /a\.ts/ })).toBeInTheDocument()
    expect(screen.getByTestId('editor-files')).toHaveTextContent('lib/a.ts')
    expect(useIdeStore.getState().activePath).toBeNull()
  })

  it('gives the Generated section a one-line empty state', () => {
    mountBlank()
    expect(screen.getByText('Appears after the first save on the canvas.')).toBeInTheDocument()
    expect(screen.getByText('No project files yet.', { exact: false })).toBeInTheDocument()
  })

  it('shows "No version yet" in the status bar and no version in the header', () => {
    mountBlank()
    expect(screen.getByText('No version yet')).toBeInTheDocument()
    expect(screen.getByTestId('header')).toHaveTextContent('no version')
  })

  it('shows the save-a-version note in the Test session and Quick test tabs, making no start request', async () => {
    const { api } = await import('../../../lib/api-client')
    mountBlank()
    expect(screen.getAllByText('Save a version on the canvas first').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull()
    act(() => useIdeLayoutStore.setState({ dockTab: 'quickTest' }))
    expect(screen.getAllByText('Save a version on the canvas first').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Run step' })).toBeNull()
    expect(api.getTestSession).toHaveBeenCalled()
    expect(api.startTestSession).not.toHaveBeenCalled()
  })

  it('shows the same note in Steps, with a working button to the canvas', async () => {
    mountBlank()
    act(() => useIdeLayoutStore.setState({ sideBarTab: 'steps', dockOpen: false }))
    expect(screen.getByText('Steps come from a saved version.')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Open canvas' }).click()
    expect(switchView).toHaveBeenCalledWith('canvas')
  })
})

describe('the caches are refreshed under a mounted workspace (a save from another tab or an agent)', () => {
  const GENERATED = [
    { path: 'worker.ts', source: '// worker\n', role: 'entry' },
    { path: 'awaitstep/workflow.ts', source: '// wf\n', role: 'module' },
  ]

  function savedAfterwards(client: ReturnType<typeof createWorkspaceClient>) {
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
  }

  it('refreshes in place, keeping tabs and drafts, when the caches are updated under a mounted workspace', async () => {
    const { client } = mountBlank([LIB_A])
    act(() => {
      useIdeStore.getState().openFile('lib/a.ts')
      useIdeStore.getState().setDraft('lib/a.ts', 'export const a = 2\n', 'h-a')
    })
    expect(screen.getByTestId('editor-files')).not.toHaveTextContent('worker.ts')

    // What the canvas's save does: the two queries are refreshed.
    await act(async () => savedAfterwards(client))

    await waitFor(() => expect(screen.getByTestId('editor-files')).toHaveTextContent('worker.ts'))
    expect(screen.getByTestId('editor-files')).toHaveTextContent('awaitstep/workflow.ts')
    expect(screen.getByTestId('header')).toHaveTextContent('v1')
    expect(screen.queryByText('No version yet')).toBeNull()
    expect(screen.queryByText('Appears after the first save on the canvas.')).toBeNull()
    // The project file's tab and unsaved text are untouched.
    expect(useIdeStore.getState().openPaths).toContain('lib/a.ts')
    expect(useIdeStore.getState().activePath).toBe('lib/a.ts')
    expect(useIdeStore.getState().drafts['lib/a.ts']?.source).toBe('export const a = 2\n')
    // Sessions can start now: the note is gone from the dock.
    expect(screen.queryAllByText('Save a version on the canvas first')).toHaveLength(0)
  })
})
