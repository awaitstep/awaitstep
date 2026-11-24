import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunCanvasPreview } from '../run-canvas-preview'

let lastNodes: { id: string; type: string }[] = []
let lastEdges: {
  id: string
  sourceHandle?: string
  targetHandle?: string
  animated?: boolean
  markerEnd?: unknown
}[] = []

// React Flow needs a measured DOM; what is under test is the node types the
// preview hands it.
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: { nodes: { id: string; type: string }[]; edges: typeof lastEdges }) => {
    lastNodes = props.nodes
    lastEdges = props.edges
    return null
  },
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))
vi.mock('../../../contexts/node-registry-context', () => ({
  NodeRegistryProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('RunCanvasPreview', () => {
  it('draws marketplace and Library nodes with the custom node component', () => {
    const ir = JSON.stringify({
      nodes: [
        { id: 'a', type: 'step', name: 'Entry', position: { x: 0, y: 0 } },
        { id: 'b', type: 'resend_send_email', name: 'Mail', position: { x: 0, y: 100 } },
      ],
      edges: [],
    })

    render(<RunCanvasPreview ir={ir} />)

    expect(lastNodes.map((n) => [n.id, n.type])).toEqual([
      ['a', 'step'],
      ['b', 'custom'],
    ])
  })

  it('draws an edge on the sides it was saved with', () => {
    const ir = JSON.stringify({
      nodes: [
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 200 } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', sourceSide: 'right' }],
    })

    render(<RunCanvasPreview ir={ir} />)

    expect(lastEdges[0]).toMatchObject({ sourceHandle: 'out-right', targetHandle: 'in-top' })
  })

  it('points every link at its target and flows the ones into a running step', () => {
    const ir = JSON.stringify({
      nodes: [
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 200 } },
        { id: 'c', type: 'step', name: 'C', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c' },
      ],
    })

    render(<RunCanvasPreview ir={ir} nodeStatuses={{ a: 'complete', b: 'running' }} />)

    expect(lastEdges.map((e) => [e.id, e.animated])).toEqual([
      ['ab', true],
      ['bc', false],
    ])
    expect(lastEdges.every((e) => e.markerEnd)).toBe(true)
  })
})
