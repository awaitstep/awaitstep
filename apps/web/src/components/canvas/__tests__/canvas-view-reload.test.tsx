import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorAccessProvider } from '../../../contexts/editor-scope-context'
import { useWorkflowStore } from '../../../stores/workflow-store'
import type { EditorToolbarProps } from '../editor-toolbar'
import { CanvasView } from '../canvas-view'
import { SAVE_CONFLICT_MESSAGE } from '../../../hooks/use-workflow-persistence'

// The real persistence hook, the real query and the real dialogs: what is
// on trial is the path from a refused save through Reload to the next save.
const api = vi.hoisted(() => ({
  getWorkflowFull: vi.fn(),
  createVersion: vi.fn(),
  updateWorkflow: vi.fn(() => Promise.resolve({})),
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ proceed: vi.fn(), reset: vi.fn(), status: 'idle', current: {}, next: {} }),
}))
vi.mock('../../../contexts/api-client-context', () => ({
  useApi: () => api,
  useApiReady: () => true,
}))
vi.mock('../../../contexts/editor-scope-context', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useItemSlugs: () => ({ org: 'acme', project: 'core', workspace: 'sales' }),
}))
vi.mock('../../../components/navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { getAll: () => [], get: () => undefined } }),
}))
vi.mock('../../../hooks/use-auto-save', () => ({ useAutoSave: () => undefined }))
vi.mock('../../../lib/export-workflow', () => ({ exportWorkflowFile: vi.fn() }))
vi.mock('../../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: toast,
}))
vi.mock('../workflow-canvas', () => ({ WorkflowCanvas: () => null }))
vi.mock('../node-palette', () => ({ NodePalette: () => null }))
vi.mock('../template-picker', () => ({ TemplatePicker: () => null }))
vi.mock('../simulation-panel', () => ({ SimulationPanel: () => null }))
vi.mock('../validation-panel', () => ({ ValidationPanel: () => null }))
vi.mock('../bindings-panel', () => ({ BindingsPanel: () => null }))
vi.mock('../canvas-side-panels', () => ({ CanvasSidePanels: () => null }))
vi.mock('../editor-toolbar', () => ({
  EditorToolbar: (props: EditorToolbarProps) => (
    <div>
      <span data-testid="conflict">{String(props.saveConflict)}</span>
      <button onClick={props.onSave}>Save</button>
      <button onClick={props.onReload}>Reload</button>
    </div>
  ),
}))

function ir(code: string) {
  return JSON.stringify({
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
        data: { code },
      },
    ],
    edges: [],
  })
}

function full(versionId: string, graphHash: string, code: string) {
  return {
    workflow: {
      id: 'wf_1',
      name: 'Orders',
      description: '',
      envVars: null,
      triggerCode: null,
      dependencies: null,
      currentVersionId: versionId,
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      kind: 'workflow',
    },
    version: {
      id: versionId,
      workflowId: 'wf_1',
      version: 2,
      ir: ir(code),
      locked: 0,
      createdAt: '2025-01-01',
    },
    graphHash,
    versions: [{ id: versionId, version: 2 }],
    liveDeployments: [],
    handlers: { modules: false, consumedQueues: [] },
  }
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <EditorAccessProvider
        value={{ canEdit: true, canDeploy: true, canShare: true, canMove: true, reason: null }}
      >
        <CanvasView workflowId="wf_1" localDevEnabled={false} />
      </EditorAccessProvider>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(useWorkflowStore.getState().graphHash).toBe('g2'))
  await screen.findByTestId('conflict')
}

/** A refused canvas save: Code has moved the workflow to v3/g3 meanwhile. */
async function refuse() {
  const { VersionConflictError } = await import('../../../lib/api-client')
  api.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v3', 'g3'))
  api.getWorkflowFull.mockImplementation(() => Promise.resolve(full('v3', 'g3', 'return 3;')))
  act(() => useWorkflowStore.setState({ isDirty: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByTestId('conflict')).toHaveTextContent('true'))
}

beforeEach(() => {
  api.getWorkflowFull.mockReset()
  api.getWorkflowFull.mockImplementation(() => Promise.resolve(full('v2', 'g2', 'return 2;')))
  api.createVersion.mockReset()
  api.updateWorkflow.mockClear()
  toast.error.mockClear()
  toast.success.mockClear()
  useWorkflowStore.getState().reset()
})

describe('CanvasView: a refused save, then Reload', () => {
  it('reloads the version Code saved, drops the canvas edits with it, and the next save builds on its base', async () => {
    await mount()
    await refuse()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(SAVE_CONFLICT_MESSAGE)
    expect(useWorkflowStore.getState().isDirty).toBe(true)
    expect(useWorkflowStore.getState().graphHash).toBe('g2')

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard and reload' }))
    await waitFor(() => expect(screen.getByTestId('conflict')).toHaveTextContent('false'))
    const state = useWorkflowStore.getState()
    expect(state.graphHash).toBe('g3')
    expect(state.isDirty).toBe(false)
    // The stored body opens as the step's module.
    expect(state.nodes[0]!.data.irNode.data.code).toBe(
      'export default async function Step_1({ env, event, inputs, step, ctx }) {\n  return 3;\n}\n',
    )

    api.createVersion.mockResolvedValueOnce({ id: 'v4', graphHash: 'g4' })
    act(() => useWorkflowStore.setState({ isDirty: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.createVersion).toHaveBeenCalledTimes(2))
    expect((api.createVersion.mock.calls[1] as unknown[])[1]).toMatchObject({ baseGraphHash: 'g3' })
    await waitFor(() => expect(useWorkflowStore.getState().graphHash).toBe('g4'))
  })

  it('keeps the conflict when the reload cannot fetch, with one toast for the failed load', async () => {
    await mount()
    await refuse()
    api.getWorkflowFull.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard and reload' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2))
    expect(toast.error.mock.calls.map((c) => c[0])).toEqual([
      SAVE_CONFLICT_MESSAGE,
      'Failed to load workflow',
    ])
    expect(screen.getByTestId('conflict')).toHaveTextContent('true')
    expect(useWorkflowStore.getState().graphHash).toBe('g2')
    expect(useWorkflowStore.getState().isDirty).toBe(true)
  })
})
