import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorAccessProvider } from '../../../contexts/editor-scope-context'
import { useCanvasLayoutStore } from '../../../stores/canvas-layout-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { CanvasView } from '../canvas-view'

const full = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ proceed: vi.fn(), reset: vi.fn(), status: 'idle', current: {}, next: {} }),
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
    handleSave: vi.fn(),
    saveNow: vi.fn(),
    handleDeploy: vi.fn(),
    saveSilent: vi.fn(),
    isSaving: false,
    lastSavedAt: null,
    saveError: null,
  }),
}))
vi.mock('../../../hooks/use-auto-save', () => ({ useAutoSave: vi.fn() }))
vi.mock('../../../lib/export-workflow', () => ({ exportWorkflowFile: vi.fn() }))
vi.mock('../../../lib/action-toast', () => ({ actionToast: { error: vi.fn() } }))
vi.mock('../workflow-canvas', () => ({ WorkflowCanvas: () => null }))
vi.mock('../node-palette', () => ({ NodePalette: () => null }))
vi.mock('../template-picker', () => ({ TemplatePicker: () => null }))
vi.mock('../simulation-panel', () => ({ SimulationPanel: () => null }))
vi.mock('../validation-panel', () => ({ ValidationPanel: () => null }))
vi.mock('../bindings-panel', () => ({ BindingsPanel: () => null }))
vi.mock('../editor-dialogs', () => ({ EditorDialogs: () => null }))
vi.mock('../canvas-side-panels', () => ({ CanvasSidePanels: () => null }))
vi.mock('../editor-toolbar', () => ({ EditorToolbar: () => <div>toolbar</div> }))

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
    versions: [{ id: 'v2', version: 2 }],
    activeDeployment: null,
    handlers: { modules: [] },
  }
}

function view(client: QueryClient, props: Partial<React.ComponentProps<typeof CanvasView>> = {}) {
  return (
    <QueryClientProvider client={client}>
      <EditorAccessProvider
        value={{ canEdit: true, canDeploy: true, canShare: true, canMove: true, reason: null }}
      >
        <CanvasView workflowId="wf_1" localDevEnabled={false} {...props} />
      </EditorAccessProvider>
    </QueryClientProvider>
  )
}

function mount(props: Partial<React.ComponentProps<typeof CanvasView>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, ...render(view(client, props)) }
}

beforeEach(() => {
  full.get.mockReset()
  full.get.mockImplementation(() => Promise.resolve(response()))
  useWorkflowStore.setState({ showSettings: false, selectedNodeId: null })
  useCanvasLayoutStore.setState({ paletteOpen: false, inspectorOpen: true })
})

describe('CanvasView ?panel=settings', () => {
  it('opens the workflow settings when it arrives with the panel in its address', async () => {
    mount({ panelParam: 'settings' })
    await waitFor(() => expect(useWorkflowStore.getState().showSettings).toBe(true))
  })

  it('opens nothing without the param, so a plain visit never inherits a request', async () => {
    mount()
    await screen.findByText('toolbar')
    await waitFor(() => expect(useWorkflowStore.getState().workflowId).toBe('wf_1'))
    expect(useWorkflowStore.getState().showSettings).toBe(false)
  })

  it('opens it once: the hydration a save or a refetch causes leaves a closed panel closed', async () => {
    const { client } = mount({ panelParam: 'settings' })
    await waitFor(() => expect(useWorkflowStore.getState().showSettings).toBe(true))
    act(() => useWorkflowStore.getState().setShowSettings(false))
    // The graph is hydrated again with changed server data, as after a save.
    full.get.mockImplementation(() => {
      const next = response()
      next.workflow.name = 'Orders, saved'
      return Promise.resolve(next)
    })
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['workflow-full'] })
    })
    await waitFor(() => expect(useWorkflowStore.getState().metadata.name).toBe('Orders, saved'))
    expect(useWorkflowStore.getState().showSettings).toBe(false)
  })

  it('does not carry the request to another workflow: it lives in that address, not in a store', async () => {
    const first = mount({ panelParam: 'settings' })
    await waitFor(() => expect(useWorkflowStore.getState().showSettings).toBe(true))
    first.unmount()
    useWorkflowStore.setState({ showSettings: false })
    mount({ workflowId: 'wf_2' })
    await waitFor(() => expect(useWorkflowStore.getState().workflowId).toBe('wf_2'))
    expect(useWorkflowStore.getState().showSettings).toBe(false)
  })

  it('does not open the settings for someone who cannot edit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <EditorAccessProvider
          value={{
            canEdit: false,
            canDeploy: false,
            canShare: false,
            canMove: false,
            reason: 'View only',
          }}
        >
          <CanvasView workflowId="wf_1" panelParam="settings" localDevEnabled={false} />
        </EditorAccessProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(useWorkflowStore.getState().workflowId).toBe('wf_1'))
    expect(useWorkflowStore.getState().showSettings).toBe(false)
  })
})

describe('CanvasView ?node=', () => {
  it('brings a hidden inspector back for the step the address names', async () => {
    useCanvasLayoutStore.setState({ inspectorOpen: false })
    mount({ nodeParam: 'n1' })
    await waitFor(() => expect(useWorkflowStore.getState().selectedNodeId).toBe('n1'))
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
  })

  it('leaves it hidden when the address names a step this version does not have', async () => {
    useCanvasLayoutStore.setState({ inspectorOpen: false })
    mount({ nodeParam: 'gone' })
    await waitFor(() => expect(useWorkflowStore.getState().workflowId).toBe('wf_1'))
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(false)
  })
})
