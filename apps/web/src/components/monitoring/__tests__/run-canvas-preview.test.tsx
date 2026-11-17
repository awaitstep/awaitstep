import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunCanvasPreview } from '../run-canvas-preview'

let lastNodes: { id: string; type: string }[] = []

// React Flow needs a measured DOM; what is under test is the node types the
// preview hands it.
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: { nodes: { id: string; type: string }[] }) => {
    lastNodes = props.nodes
    return null
  },
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
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
})
