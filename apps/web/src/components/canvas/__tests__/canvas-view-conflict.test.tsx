import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorAccessProvider, EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { useWorkflowStore } from '../../../stores/workflow-store'
import type { EditorToolbarProps } from '../editor-toolbar'
import { CanvasView } from '../canvas-view'

const full = vi.hoisted(() => ({ get: vi.fn() }))
const persistence = vi.hoisted(() => ({
  saveConflict: false,
  handleSave: vi.fn(),
  reload: vi.fn(() => Promise.resolve(true)),
}))
const autoSave = vi.hoisted(() => ({ calls: [] as { enabled: boolean }[] }))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ proceed: vi.fn(), reset: vi.fn(), status: 'idle', current: {}, next: {} }),
  useLocation: () => ({ href: '/workflows/wf_1' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../../../contexts/api-client-context', () => ({
  useApi: () => ({ getWorkflowFull: full.get }),
  useApiReady: () => true,
}))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { getAll: () => [] } }),
}))
vi.mock('../../../hooks/use-workflow-persistence', () => ({
  useWorkflowPersistence: () => ({
    handleSave: persistence.handleSave,
    saveNow: vi.fn(),
    handleDeploy: vi.fn(),
    saveSilent: vi.fn(),
    isSaving: false,
    lastSavedAt: null,
    saveError: null,
    saveConflict: persistence.saveConflict,
    reload: persistence.reload,
    reloading: false,
  }),
}))
vi.mock('../../../hooks/use-auto-save', () => ({
  useAutoSave: (opts: { enabled: boolean }) => {
    autoSave.calls.push(opts)
  },
}))
vi.mock('../../../lib/export-workflow', () => ({ exportWorkflowFile: vi.fn() }))
vi.mock('../../../lib/action-toast', () => ({ actionToast: { error: vi.fn() } }))
vi.mock('../workflow-canvas', () => ({ WorkflowCanvas: () => null }))
vi.mock('../node-palette', () => ({ NodePalette: () => null }))
vi.mock('../template-picker', () => ({ TemplatePicker: () => null }))
vi.mock('../simulation-panel', () => ({ SimulationPanel: () => null }))
vi.mock('../validation-panel', () => ({ ValidationPanel: () => null }))
vi.mock('../bindings-panel', () => ({ BindingsPanel: () => null }))
vi.mock('../canvas-side-panels', () => ({ CanvasSidePanels: () => null }))
// The real toolbar is tested on its own; here it is the wiring that matters.
vi.mock('../editor-toolbar', () => ({
  EditorToolbar: (props: EditorToolbarProps) => (
    <div>
      <span data-testid="conflict">{String(props.saveConflict)}</span>
      <button onClick={props.onReload}>Reload</button>
    </div>
  ),
}))

const IR = JSON.stringify({
  metadata: { name: 'WF', version: 1, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  entryNodeId: 'n1',
  nodes: [
    {
      id: 'n1',
      type: 'step',
      name: 'Step 1',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
})

function response() {
  return {
    workflow: {
      id: 'wf_1',
      name: 'Orders',
      description: '',
      envVars: null,
      triggerCode: null,
      dependencies: null,
      currentVersionId: 'v2',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      kind: 'workflow',
    },
    version: {
      id: 'v2',
      workflowId: 'wf_1',
      version: 2,
      ir: IR,
      locked: 0,
      createdAt: '2025-01-01',
    },
    graphHash: 'g2',
    versions: [{ id: 'v2', version: 2 }],
    liveDeployments: [],
    handlers: { modules: false, consumedQueues: [] },
  }
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <EditorScopeProvider value={{ org: 'acme', project: 'p', workspace: 'w' }}>
        <EditorAccessProvider
          value={{ canEdit: true, canDeploy: true, canShare: true, canMove: true, reason: null }}
        >
          <CanvasView workflowId="wf_1" marketplaceOpen={false} localDevEnabled={false} />
        </EditorAccessProvider>
      </EditorScopeProvider>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(useWorkflowStore.getState().workflowId).toBe('wf_1'))
  await screen.findByTestId('conflict')
  return view
}

beforeEach(() => {
  full.get.mockReset()
  full.get.mockImplementation(() => Promise.resolve(response()))
  persistence.saveConflict = false
  persistence.handleSave.mockClear()
  persistence.reload.mockClear()
  autoSave.calls.length = 0
  useWorkflowStore.getState().reset()
})

describe('CanvasView once Code changed the workflow', () => {
  it('hydrates the loaded graph hash into the store', async () => {
    await mount()
    expect(useWorkflowStore.getState().graphHash).toBe('g2')
  })

  it('keeps autosave on while nothing is in the way, and stops it at the conflict', async () => {
    const first = await mount()
    expect(autoSave.calls.at(-1)).toEqual({ enabled: true, save: expect.any(Function) })
    first.unmount()
    autoSave.calls.length = 0
    persistence.saveConflict = true
    await mount()
    expect(autoSave.calls.at(-1)?.enabled).toBe(false)
  })

  it('ignores the save shortcut at the conflict', async () => {
    persistence.saveConflict = true
    const first = await mount()
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(persistence.handleSave).not.toHaveBeenCalled()
    first.unmount()
    persistence.saveConflict = false
    await mount()
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(persistence.handleSave).toHaveBeenCalledTimes(1)
  })

  it('reloads at once while nothing is unsaved', async () => {
    persistence.saveConflict = true
    await mount()
    await userEvent.click(screen.getAllByRole('button', { name: 'Reload' })[0]!)
    expect(persistence.reload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks before reloading over unsaved canvas edits, and reloads on Discard', async () => {
    persistence.saveConflict = true
    await mount()
    act(() => useWorkflowStore.setState({ isDirty: true }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Reload' })[0]!)
    expect(persistence.reload).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Discard your unsaved canvas changes?',
    })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard and reload' }))
    expect(persistence.reload).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})
