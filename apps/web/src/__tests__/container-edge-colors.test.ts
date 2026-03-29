import { describe, it, expect } from 'vitest'
import { buildContainerEdgeColors } from '../lib/container-edge-colors'
import type { FlowNode } from '../stores/workflow-store'
import type { Edge } from '@xyflow/react'

function flowNode(id: string, type: string): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      irNode: {
        id,
        type,
        name: id,
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {},
      },
    },
  }
}

function edge(id: string, source: string, target: string, label?: string): Edge {
  return { id, source, target, ...(label ? { label } : {}) }
}

describe('buildContainerEdgeColors', () => {
  it('returns empty map when no containers exist', () => {
    const nodes = [flowNode('a', 'step'), flowNode('b', 'step')]
    const edges = [edge('e1', 'a', 'b')]
    const colors = buildContainerEdgeColors(nodes, edges)
    expect(colors.size).toBe(0)
  })

  it('colors loop body edge', () => {
    const nodes = [flowNode('loop', 'loop'), flowNode('s1', 'step')]
    const edges = [edge('e1', 'loop', 's1', 'body')]
    const colors = buildContainerEdgeColors(nodes, edges)
    expect(colors.has('e1')).toBe(true)
  })

  it('does not color loop "then" edge', () => {
    const nodes = [flowNode('loop', 'loop'), flowNode('s1', 'step'), flowNode('s2', 'step')]
    const edges = [edge('e1', 'loop', 's1', 'body'), edge('e2', 'loop', 's2', 'then')]
    const colors = buildContainerEdgeColors(nodes, edges)
    expect(colors.has('e1')).toBe(true)
    expect(colors.has('e2')).toBe(false)
  })

  it('propagates color through body chain', () => {
    const nodes = [
      flowNode('loop', 'loop'),
      flowNode('s1', 'step'),
      flowNode('s2', 'step'),
      flowNode('s3', 'step'),
    ]
    const edges = [edge('e1', 'loop', 's1', 'body'), edge('e2', 's1', 's2'), edge('e3', 's2', 's3')]
    const colors = buildContainerEdgeColors(nodes, edges)
    expect(colors.has('e1')).toBe(true)
    expect(colors.has('e2')).toBe(true)
    expect(colors.has('e3')).toBe(true)
  })

  it('colors branch edges inside loop body', () => {
    const nodes = [
      flowNode('loop', 'loop'),
      flowNode('s1', 'step'),
      flowNode('br', 'branch'),
      flowNode('a', 'step'),
      flowNode('b', 'step'),
    ]
    const edges = [
      edge('e1', 'loop', 's1', 'body'),
      edge('e2', 's1', 'br'),
      edge('e3', 'br', 'a', 'yes'),
      edge('e4', 'br', 'b', 'no'),
    ]
    const colors = buildContainerEdgeColors(nodes, edges)
    // All edges in the body chain should be colored
    expect(colors.has('e1')).toBe(true)
    expect(colors.has('e2')).toBe(true)
    expect(colors.has('e3')).toBe(true)
    expect(colors.has('e4')).toBe(true)
  })

  it('colors try/catch edges with orange', () => {
    const nodes = [flowNode('tc', 'try_catch'), flowNode('s1', 'step'), flowNode('s2', 'step')]
    const edges = [edge('e1', 'tc', 's1', 'try'), edge('e2', 'tc', 's2', 'catch')]
    const colors = buildContainerEdgeColors(nodes, edges)
    expect(colors.has('e1')).toBe(true)
    expect(colors.has('e2')).toBe(true)
    // Both should be the same orange color
    expect(colors.get('e1')).toBe(colors.get('e2'))
  })

  it('does not color edges outside containers', () => {
    const nodes = [
      flowNode('s0', 'step'),
      flowNode('loop', 'loop'),
      flowNode('s1', 'step'),
      flowNode('s2', 'step'),
    ]
    const edges = [
      edge('before', 's0', 'loop'),
      edge('body', 'loop', 's1', 'body'),
      edge('after', 'loop', 's2', 'then'),
    ]
    const colors = buildContainerEdgeColors(nodes, edges)
    expect(colors.has('before')).toBe(false)
    expect(colors.has('body')).toBe(true)
    expect(colors.has('after')).toBe(false)
  })

  it('handles empty edges gracefully', () => {
    const nodes = [flowNode('loop', 'loop')]
    const colors = buildContainerEdgeColors(nodes, [])
    expect(colors.size).toBe(0)
  })
})
