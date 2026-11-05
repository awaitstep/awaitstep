import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiClient from '../../../lib/api-client'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { CanvasPreview } from '../canvas-preview'
import { loadGraph, SyncHarness } from './fixtures/step-sync'

const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { get: () => undefined } }),
}))
vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkflowRuns: () => Promise.resolve({ data: [], nextCursor: null }),
    },
  }
})

let lastProps: { nodes: FakeNode[]; onNodesChange: (changes: unknown[]) => void } | null = null

interface FakeNode {
  measured?: { width?: number; height?: number }
  id: string
  selected?: boolean
  data: { irNode: { name: string } }
}

// React Flow needs a measured DOM; what is under test is what the preview
// hands it and what it does with its events.
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: {
    nodes: FakeNode[]
    onNodeClick: (e: unknown, n: FakeNode) => void
    onNodeDoubleClick: (e: unknown, n: FakeNode) => void
    onPaneClick: () => void
    elementsSelectable: boolean
    onNodesChange: (changes: unknown[]) => void
    nodesDraggable: boolean
    nodesConnectable: boolean
    children: ReactNode
  }) => {
    lastProps = props
    return (
      <div
        data-testid="flow"
        data-selectable={String(props.elementsSelectable)}
        data-draggable={String(props.nodesDraggable)}
        data-connectable={String(props.nodesConnectable)}
        onClick={props.onPaneClick}
      >
        {props.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            data-node={node.id}
            data-selected={String(Boolean(node.selected))}
            onClick={(e) => {
              e.stopPropagation()
              props.onNodeClick(e, node)
            }}
            onDoubleClick={(e) => props.onNodeDoubleClick(e, node)}
          >
            {node.data.irNode.name}
          </button>
        ))}
      </div>
    )
  },
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useNodesInitialized: () => false,
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(),
    getViewport: vi.fn(),
    setCenter: vi.fn(),
  }),
  useStore: () => 0,
  useStoreApi: () => ({ getState: () => ({ width: 0, height: 0 }) }),
}))
vi.mock('../../canvas/nodes', () => ({ nodeTypes: {} }))
vi.mock('../../canvas/labeled-edge', () => ({ LabeledEdge: () => null }))

function renderPreview(codeVersionId = 'v-12', files?: ReadonlyMap<string, { source: string }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SyncHarness codeVersionId={codeVersionId} {...(files && { files })}>
        <CanvasPreview workflowId="wf_1" />
      </SyncHarness>
    </QueryClientProvider>,
  )
}

/** The outline style rules the preview emits, keyed by node id. */
function outlineOf(id: string): string {
  const css = document.querySelector('style')?.textContent ?? ''
  return css.split('\n').find((rule) => rule.includes(`[data-id="${id}"]`)) ?? ''
}

const node = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!

beforeEach(() => {
  switchView.mockReset()
  useIdeStore.getState().resetSession()
  useIdeLayoutStore.setState({ previewOpen: true })
  useWorkflowStore.getState().reset()
  loadGraph()
})

describe('CanvasPreview', () => {
  it('hands React Flow the very same node objects as the editor moves between files', () => {
    useIdeStore.getState().openFile('nodes/charge_card.ts')
    renderPreview()
    const before = lastProps!.nodes
    act(() => useIdeStore.getState().openFile('nodes/ship_order.ts'))
    act(() => useIdeStore.getState().openFile('lib/payments/charge.ts'))
    expect(lastProps!.nodes).toHaveLength(before.length)
    lastProps!.nodes.forEach((n, i) => expect(n).toBe(before[i]))
  })

  it('hands back the sizes React Flow measured, so rebuilding a node does not lose them', () => {
    renderPreview()
    act(() =>
      lastProps!.onNodesChange([
        { id: 'ship', type: 'dimensions', dimensions: { width: 90, height: 30 } },
      ]),
    )
    act(() => useIdeStore.getState().selectNode('ship'))
    const ship = lastProps!.nodes.find((n) => n.id === 'ship')!
    expect(ship.selected).toBe(true)
    expect(ship.measured).toEqual({ width: 90, height: 30 })
  })

  it('lets nodes be clicked but never dragged or connected', () => {
    renderPreview()
    const flow = screen.getByTestId('flow')
    expect(flow).toHaveAttribute('data-selectable', 'true')
    expect(flow).toHaveAttribute('data-draggable', 'false')
    expect(flow).toHaveAttribute('data-connectable', 'false')
  })

  it('outlines the step whose file is open, and nothing else', () => {
    useIdeStore.getState().openFile('nodes/charge_card.ts')
    renderPreview()
    expect(outlineOf('charge')).toContain('2px solid')
    expect(outlineOf('validate')).toBe('')
    expect(screen.queryByText(/Used by/)).toBeNull()
  })

  it('keeps outlining the step while its Compare tab is active, and none for Review', () => {
    useIdeStore.getState().openCompare('nodes/charge_card.ts')
    renderPreview()
    expect(outlineOf('charge')).toContain('2px solid')
    act(() => useIdeStore.getState().openReview())
    expect(outlineOf('charge')).toBe('')
  })

  it('outlines every step that imports an open helper, more lightly, and counts them', () => {
    useIdeStore.getState().openFile('lib/payments/charge.ts')
    renderPreview()
    expect(outlineOf('validate')).toContain('1px solid')
    expect(outlineOf('charge')).toContain('1px solid')
    expect(outlineOf('ship')).toBe('')
    expect(screen.getByText('Used by 2 steps')).toBeInTheDocument()
  })

  it('says "1 step" when one step imports the helper', () => {
    useIdeStore.getState().openFile('lib/payments/charge.ts')
    renderPreview(
      'v-12',
      new Map([
        ['nodes/ship_order.ts', { source: "import { c } from '#app/lib/payments/charge'" }],
        ['lib/payments/charge.ts', { source: '' }],
      ]),
    )
    expect(screen.getByText('Used by 1 step')).toBeInTheDocument()
  })

  it('lights nothing for a config file', () => {
    useIdeStore.getState().openFile('package.json')
    renderPreview()
    for (const id of ['validate', 'charge', 'check', 'ship', 'wait']) {
      expect(outlineOf(id)).toBe('')
    }
    expect(screen.queryByText(/Used by/)).toBeNull()
  })

  it('follows the editor as the active tab changes', () => {
    renderPreview()
    expect(outlineOf('ship')).toBe('')
    act(() => useIdeStore.getState().openFile('nodes/ship_order.ts'))
    expect(outlineOf('ship')).toContain('2px solid')
  })

  it('selects a clicked step, opens its file and asks for the keyboard in the editor', async () => {
    const focus = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn(), searchSeed: () => null })
    renderPreview()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Validate order' }))
    expect(useIdeStore.getState().activePath).toBe('nodes/validate_order.ts')
    expect(useIdeStore.getState().selectedNodeId).toBe('validate')
    // The editor may be a different one by the time the file shows: the request waits for it.
    expect(useIdeStore.getState().editorFocusRequested).toBe(true)
    expect(focus).not.toHaveBeenCalled()
    expect(node('validate').dataset.selected).toBe('true')
    expect(
      await screen.findByRole('region', { name: 'Validate order details' }),
    ).toBeInTheDocument()
  })

  it('selects a step with no file without opening anything', async () => {
    renderPreview()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Wait 2 days' }))
    expect(useIdeStore.getState().selectedNodeId).toBe('wait')
    expect(useIdeStore.getState().openPaths).toEqual([])
    expect(await screen.findByText(/Written in/)).toBeInTheDocument()
  })

  it('opens the canvas on the node when it is double-clicked', async () => {
    renderPreview()
    await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Charge card' }))
    expect(switchView).toHaveBeenLastCalledWith('canvas', { version: undefined, node: 'charge' })
  })

  it('carries the selected step to the canvas from the header button', async () => {
    useIdeStore.getState().selectNode('ship')
    renderPreview()
    await userEvent.setup().click(screen.getAllByRole('button', { name: /Edit on canvas/ })[0]!)
    expect(switchView).toHaveBeenLastCalledWith('canvas', { version: undefined, node: 'ship' })
  })

  it('opens the canvas with no node when none is selected', async () => {
    renderPreview()
    await userEvent.setup().click(screen.getByRole('button', { name: /Edit on canvas/ }))
    expect(switchView).toHaveBeenLastCalledWith('canvas', { version: undefined })
  })

  it('clears the selection when the empty graph is clicked', async () => {
    useIdeStore.getState().selectNode('ship')
    renderPreview()
    await userEvent.setup().click(screen.getByTestId('flow'))
    expect(useIdeStore.getState().selectedNodeId).toBeNull()
  })

  it('opens no inspector for a selection the graph no longer has', () => {
    useIdeStore.getState().selectNode('deleted')
    renderPreview()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('says it is synced with the version being read', () => {
    renderPreview()
    expect(screen.getByText('Synced with v12')).toBeInTheDocument()
  })

  it('says which version is which when the code and graph differ', () => {
    renderPreview('v-11')
    expect(screen.getByText('Showing v12 · you’re editing v11')).toBeInTheDocument()
  })
})
