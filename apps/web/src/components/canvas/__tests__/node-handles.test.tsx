import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { ReactFlow, ReactFlowProvider, useReactFlow, type NodeTypes } from '@xyflow/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { clearWorkflowHistory, useWorkflowStore } from '../../../stores/workflow-store'
import { withEdgeSides } from '../../../lib/canvas/node-sides'
import { nodeTypes } from '../nodes'
import { canLeaveSelectedNode } from '../leave-guard'

// Real React Flow, with only the browser's measuring faked.
beforeAll(() => {
  const isNode = (el: HTMLElement) => el.classList.contains('react-flow__node')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isNode(this) ? 248 : 1200
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isNode(this) ? 64 : 800
    },
  })
  class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 0, height: 0 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m22 = 1
    },
  )
})

function step(id: string, x: number, y: number, code = 'return 1'): WorkflowNode {
  return { id, type: 'step', name: id, position: { x, y }, version: '1.0.0', data: { code } }
}

function seed(nodes: WorkflowNode[], edges: { id: string; source: string; target: string }[] = []) {
  useWorkflowStore.setState({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position!,
      data: { irNode: n },
    })),
    edges,
    readOnly: false,
  } as never)
  clearWorkflowHistory()
}

let flow: ReturnType<typeof useReactFlow> | null = null
function Grab() {
  flow = useReactFlow()
  return null
}

// Wired as the editor's canvas wires it: its node changes and its guarded selection.
function handleNodeClick(_event: unknown, node: { id: string }) {
  if (canLeaveSelectedNode(node.id)) useWorkflowStore.getState().selectNode(node.id)
}

function Flow({ connectable }: { connectable: boolean }) {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  return (
    <ReactFlow
      nodes={nodes}
      edges={withEdgeSides(nodes, edges)}
      nodeTypes={nodeTypes as NodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={handleNodeClick}
      nodesConnectable={connectable}
      connectOnClick={false}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
    >
      <Grab />
    </ReactFlow>
  )
}

function renderFlow(connectable = true) {
  return render(
    <ReactFlowProvider>
      <div style={{ width: 1200, height: 800 }}>
        <Flow connectable={connectable} />
      </div>
    </ReactFlowProvider>,
  )
}

function nodeEl(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!
}

beforeEach(() => {
  useWorkflowStore.getState().reset()
})

describe('a canvas node’s joins', () => {
  it('offers a + on every side of a node with no edges', () => {
    seed([step('a', 0, 0)])
    renderFlow()
    const node = within(nodeEl('a'))
    for (const name of ['above', 'to the left', 'below', 'to the right']) {
      expect(node.getByLabelText(`Add a node ${name}`)).toBeTruthy()
    }
  })

  it('offers no + on the sides an edge uses, nor on a step’s other exit', () => {
    seed([step('a', 0, 0), step('b', 0, 200)], [{ id: 'e1', source: 'a', target: 'b' }])
    renderFlow()
    const a = within(nodeEl('a'))
    expect(a.queryByLabelText('Add a node below')).toBeNull()
    expect(a.queryByLabelText('Add a node to the right')).toBeNull()
    expect(a.getByLabelText('Add a node above')).toBeTruthy()
    const b = within(nodeEl('b'))
    expect(b.queryByLabelText('Add a node above')).toBeNull()
    expect(b.getByLabelText('Add a node to the left')).toBeTruthy()
  })

  it('offers no + where connecting is off, as in the previews', () => {
    seed([step('a', 0, 0)])
    renderFlow(false)
    expect(within(nodeEl('a')).queryByLabelText(/Add a node/)).toBeNull()
  })

  it('opens the node selector from a + and adds the picked node on that side', async () => {
    seed([step('a', 0, 0)])
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node to the right'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Add to the right')).toBeTruthy()
    expect(within(dialog).getByText('from a')).toBeTruthy()
    await userEvent.type(within(dialog).getByLabelText('Search nodes'), 'sleep')
    await userEvent.click(within(dialog).getByText('Sleep', { exact: true }).closest('button')!)

    const { nodes, edges } = useWorkflowStore.getState()
    const added = nodes.find((n) => n.id !== 'a')!
    expect(added.data.irNode.type).toBe('sleep')
    expect(added.position.x).toBeGreaterThan(248)
    expect(edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'a', target: added.id },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Regression: the selector's events bubbled up the React tree into the
  // node, so the click that picked a node also selected the one with the +.
  it('selects the added node, and only it, in the panel and on the canvas', async () => {
    seed([step('a', 0, 0)])
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node below'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByText('Sleep', { exact: true }).closest('button')!)

    const { nodes, selectedNodeId } = useWorkflowStore.getState()
    const added = nodes.find((n) => n.id !== 'a')!
    expect(selectedNodeId).toBe(added.id)
    expect(nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([added.id])
  })

  // Regression: arrow keys in the selector reached the node and moved it.
  it('does not move the node when arrow keys are pressed in the selector', async () => {
    seed([step('a', 0, 0)])
    // Selected, as arrow keys move only selected nodes.
    useWorkflowStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node to the right'))
    const dialog = await screen.findByRole('dialog')
    within(dialog).getByText('Sleep', { exact: true }).closest('button')!.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    expect(useWorkflowStore.getState().nodes[0]!.position).toEqual({ x: 0, y: 0 })
  })

  it('keeps a selected step with errors selected instead of opening the selector', async () => {
    seed([step('a', 0, 0, '')])
    useWorkflowStore.getState().selectNode('a')
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node below'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useWorkflowStore.getState().selectedNodeId).toBe('a')
  })

  it('closes the selector when its + is clicked again', async () => {
    seed([step('a', 0, 0)])
    renderFlow()
    const plus = within(nodeEl('a')).getByLabelText('Add a node below')
    await userEvent.click(plus)
    await screen.findByRole('dialog')
    await userEvent.click(plus)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the selector when the canvas pans', async () => {
    seed([step('a', 0, 0)])
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node below'))
    await screen.findByRole('dialog')
    await act(async () => {
      await flow!.setViewport({ x: 120, y: 40, zoom: 1 })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves out nodes a function cannot run', async () => {
    seed([step('a', 0, 0)])
    useWorkflowStore.setState({ kind: 'script' })
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node below'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Sleep', { exact: true })).toBeNull()
    expect(within(dialog).getByText('HTTP Request', { exact: false })).toBeTruthy()
  })

  it('closes the selector on Escape without adding anything', async () => {
    seed([step('a', 0, 0)])
    renderFlow()
    await userEvent.click(within(nodeEl('a')).getByLabelText('Add a node below'))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useWorkflowStore.getState().nodes).toHaveLength(1)
  })
})
