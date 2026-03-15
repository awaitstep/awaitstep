import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { topologicalSort, buildAdjacencyList } from '../dag.js'
import simpleWorkflow from './fixtures/simple-workflow.json'

describe('topologicalSort', () => {
  it('returns nodes in dependency order', () => {
    const sorted = topologicalSort(simpleWorkflow as unknown as WorkflowIR)
    const ids = sorted.map((n) => n.id)
    expect(ids.indexOf('step-1')).toBeLessThan(ids.indexOf('sleep-1'))
    expect(ids.indexOf('sleep-1')).toBeLessThan(ids.indexOf('step-2'))
  })

  it('throws on cyclic graph', () => {
    const cyclic: WorkflowIR = {
      metadata: {
        name: 'cyclic',
        version: 1,
        createdAt: '',
        updatedAt: '',
      },
      nodes: [
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 }, code: '1' },
        { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 0 }, code: '2' },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
      entryNodeId: 'a',
    }
    expect(() => topologicalSort(cyclic)).toThrow('cycle')
  })
})

describe('buildAdjacencyList', () => {
  it('builds correct adjacency list', () => {
    const adj = buildAdjacencyList(simpleWorkflow as unknown as WorkflowIR)
    expect(adj.get('step-1')).toEqual(['sleep-1'])
    expect(adj.get('sleep-1')).toEqual(['step-2'])
    expect(adj.get('step-2')).toEqual([])
  })
})
