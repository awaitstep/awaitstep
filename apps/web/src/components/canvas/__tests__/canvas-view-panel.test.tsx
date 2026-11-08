import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorAccessProvider, EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { useCanvasLayoutStore } from '../../../stores/canvas-layout-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { CanvasView } from '../canvas-view'

const full = vi.hoisted(() => ({ get: vi.fn() }))

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
    liveDeployments: [],
    handlers: { modules: [] },
  }
}

function view(client: QueryClient, props: Partial<React.ComponentProps<typeof CanvasView>> = {}) {
  return (
    <QueryClientProvider client={client}>
      <EditorScopeProvider value={{ org: 'acme', project: 'p', workspace: 'w' }}>
        <EditorAccessProvider
          value={{ canEdit: true, canDeploy: true, canShare: true, canMove: true, reason: null }}
        >
          <CanvasView
            workflowId="wf_1"
            marketplaceOpen={false}
            localDevEnabled={false}
            {...props}
          />
        </EditorAccessProvider>
      </EditorScopeProvider>
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
  useWorkflowStore.setState({ selectedNodeId: null })
  useCanvasLayoutStore.setState({ paletteOpen: false, inspectorOpen: true })
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
