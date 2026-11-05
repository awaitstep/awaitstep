import { render, waitFor } from '@testing-library/react'
import { ReactFlow, ReactFlowProvider, useReactFlow, type Node } from '@xyflow/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useMeasuredNodes } from '../../../hooks/use-measured-nodes'
import { internalNodeRect } from '../../../lib/ide/viewport'
import { PanToNode } from '../preview-pan'

// Real React Flow, with only the browser's measuring faked: a node is 100x40
// and the panel 400x300. The node handed to React Flow carries no `measured`,
// as in the preview, so this fails if the pan reads the user's node.
beforeAll(() => {
  const isNode = (el: HTMLElement) => el.classList.contains('react-flow__node')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isNode(this) ? 100 : 400
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isNode(this) ? 40 : 300
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

const nodes: Node[] = [
  { id: 'near', position: { x: 20, y: 20 }, data: {} },
  { id: 'far', position: { x: 900, y: 700 }, data: {} },
]

let flowRef: ReturnType<typeof useReactFlow> | null = null
function Grab() {
  flowRef = useReactFlow()
  return null
}

function Flow({ nodeId }: { nodeId: string }) {
  const measured = useMeasuredNodes(nodes)
  return (
    <ReactFlow
      nodes={measured.nodes}
      onNodesChange={measured.onNodesChange}
      edges={[]}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
    >
      <Grab />
      <PanToNode nodeId={nodeId} />
    </ReactFlow>
  )
}

function renderFlow(nodeId: string) {
  return render(
    <ReactFlowProvider>
      <div style={{ width: 400, height: 300 }}>
        <Flow nodeId={nodeId} />
      </div>
    </ReactFlowProvider>,
  )
}

describe('PanToNode against the real React Flow', () => {
  it('brings an off-screen node into view although the supplied node has no measured size', async () => {
    renderFlow('far')
    await waitFor(() => expect(flowRef!.getViewport().x).toBeLessThan(-500), { timeout: 3000 })
    expect(flowRef!.getViewport().zoom).toBe(1)
  })

  it('leaves the view where it is for a node already showing', async () => {
    renderFlow('near')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(flowRef!.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('reads size and place from the internal node, which getNode does not carry', async () => {
    render(
      <ReactFlowProvider>
        <div style={{ width: 400, height: 300 }}>
          <ReactFlow nodes={nodes} edges={[]}>
            <Grab />
          </ReactFlow>
        </div>
      </ReactFlowProvider>,
    )
    await waitFor(() => expect(flowRef!.getInternalNode('far')?.measured.width).toBe(100))
    expect(flowRef!.getNode('far')?.measured).toBeUndefined()
    expect(internalNodeRect(flowRef!.getInternalNode('far'))).toEqual({
      x: 900,
      y: 700,
      width: 100,
      height: 40,
    })
  })
})
