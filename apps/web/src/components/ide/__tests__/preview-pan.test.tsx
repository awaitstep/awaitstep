import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanToNode } from '../preview-pan'

const setCenter = vi.fn()
let viewport = { x: 0, y: 0, zoom: 1 }
let initialized = true
// The shape of React Flow's internal node, which is what the pan reads.
const internal = (x: number, y: number, measured: { width?: number; height?: number }) => ({
  measured,
  internals: { positionAbsolute: { x, y } },
})
const nodes: Record<string, ReturnType<typeof internal>> = {
  near: internal(20, 20, { width: 100, height: 40 }),
  far: internal(900, 700, { width: 100, height: 40 }),
  unmeasured: internal(900, 700, {}),
}
let panel = { width: 400, height: 300 }

vi.mock('@xyflow/react', () => ({
  useNodesInitialized: () => initialized,
  useReactFlow: () => ({
    getInternalNode: (id: string) => nodes[id],
    getViewport: () => viewport,
    setCenter,
  }),
  useStoreApi: () => ({ getState: () => panel }),
}))

beforeEach(() => {
  setCenter.mockReset()
  viewport = { x: 0, y: 0, zoom: 1 }
  initialized = true
  panel = { width: 400, height: 300 }
})

describe('PanToNode', () => {
  it('leaves the view alone when the node is already showing', () => {
    render(<PanToNode nodeId="near" />)
    expect(setCenter).not.toHaveBeenCalled()
  })

  it('centres a node that is off screen, keeping the zoom', () => {
    viewport = { x: 0, y: 0, zoom: 0.8 }
    render(<PanToNode nodeId="far" />)
    expect(setCenter).toHaveBeenCalledWith(950, 720, { zoom: 0.8, duration: 200 })
  })

  it('does nothing for no node, an unknown node, or one not yet measured', () => {
    render(<PanToNode nodeId={null} />)
    render(<PanToNode nodeId="missing" />)
    render(<PanToNode nodeId="unmeasured" />)
    expect(setCenter).not.toHaveBeenCalled()
  })

  it('waits until the graph is measured and the panel has a size', () => {
    initialized = false
    const { rerender } = render(<PanToNode nodeId="far" />)
    expect(setCenter).not.toHaveBeenCalled()
    initialized = true
    panel = { width: 0, height: 0 }
    rerender(<PanToNode nodeId="far" />)
    expect(setCenter).not.toHaveBeenCalled()
  })

  it('does not pull the view back when the panel is resized', () => {
    const { rerender } = render(<PanToNode nodeId="far" />)
    expect(setCenter).toHaveBeenCalledOnce()
    panel = { width: 500, height: 300 }
    rerender(<PanToNode nodeId="far" />)
    expect(setCenter).toHaveBeenCalledOnce()
  })

  it('moves again when the node changes', () => {
    const { rerender } = render(<PanToNode nodeId="near" />)
    rerender(<PanToNode nodeId="far" />)
    expect(setCenter).toHaveBeenCalledOnce()
  })
})
