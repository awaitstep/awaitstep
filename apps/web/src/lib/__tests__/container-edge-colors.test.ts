import { describe, it, expect } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { WorkflowNode } from '@awaitstep/ir'
import { withContainerEdgeColors } from '../container-edge-colors'
import type { FlowNode } from '../../stores/workflow-store'

function makeNode(id: string, type: string): FlowNode {
  const irNode: WorkflowNode = {
    id,
    type,
    name: id,
    version: '1.0.0',
    provider: 'cloudflare',
    data: {},
  }
  return { id, type, position: { x: 0, y: 0 }, data: { irNode } }
}

function makeEdge(id: string, source: string, target: string, label?: string): Edge {
  return { id, source, target, ...(label !== undefined && { label }) }
}

describe('withContainerEdgeColors', () => {
  it('colors a loop body edge and the chain hanging off it', () => {
    const nodes = [makeNode('l1', 'loop'), makeNode('s1', 'step'), makeNode('s2', 'step')]
    const edges = [makeEdge('e1', 'l1', 's1', 'body'), makeEdge('e2', 's1', 's2')]

    const result = withContainerEdgeColors(nodes, edges)

    expect(result.map((e) => e.data?.['containerColor'])).toEqual([
      'oklch(0.7 0.12 200)',
      'oklch(0.7 0.12 200)',
    ])
  })

  it('returns the same array when the graph has no containers', () => {
    // A preview re-renders nothing for the common case, which is why this is
    // identity rather than a fresh array of untouched edges.
    const nodes = [makeNode('s1', 'step'), makeNode('s2', 'step')]
    const edges = [makeEdge('e1', 's1', 's2')]

    expect(withContainerEdgeColors(nodes, edges)).toBe(edges)
  })

  it('leaves edges outside a container untouched', () => {
    const nodes = [makeNode('l1', 'loop'), makeNode('s1', 'step'), makeNode('s2', 'step')]
    const edges = [makeEdge('e1', 'l1', 's1', 'body'), makeEdge('e2', 'l1', 's2', 'next')]

    const result = withContainerEdgeColors(nodes, edges)

    expect(result[0]?.data?.['containerColor']).toBe('oklch(0.7 0.12 200)')
    expect(result[1]?.data?.['containerColor']).toBeUndefined()
  })

  it('keeps whatever else the edge carried in data', () => {
    const nodes = [makeNode('l1', 'loop'), makeNode('s1', 'step')]
    const edges = [{ ...makeEdge('e1', 'l1', 's1', 'body'), data: { hovered: true } }]

    const result = withContainerEdgeColors(nodes, edges)

    expect(result[0]?.data).toEqual({ hovered: true, containerColor: 'oklch(0.7 0.12 200)' })
  })

  it('does not mutate the edges it was given', () => {
    const nodes = [makeNode('l1', 'loop'), makeNode('s1', 'step')]
    const edges = [makeEdge('e1', 'l1', 's1', 'body')]

    withContainerEdgeColors(nodes, edges)

    expect(edges[0]?.data).toBeUndefined()
  })
})
