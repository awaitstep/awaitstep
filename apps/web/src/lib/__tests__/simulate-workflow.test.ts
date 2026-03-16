import { describe, it, expect } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { WorkflowNode } from '@awaitstep/ir'
import { simulateWorkflow } from '../simulate-workflow'
import type { FlowNode } from '../../stores/workflow-store'

function makeFlowNode(irNode: WorkflowNode): FlowNode {
  return {
    id: irNode.id,
    type: irNode.type,
    position: irNode.position,
    data: { irNode },
  }
}

function makeStepNode(id: string, name?: string): FlowNode {
  return makeFlowNode({
    id,
    type: 'step',
    name: name ?? `Step ${id}`,
    position: { x: 0, y: 0 },
    code: 'return { ok: true };',
  })
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return { id: `${source}-${target}`, source, target, ...(label ? { label } : {}) }
}

describe('simulateWorkflow', () => {
  // ── empty ──

  describe('empty', () => {
    it('returns issue and 0 paths for 0 nodes', () => {
      const result = simulateWorkflow([], [])
      expect(result.paths).toHaveLength(0)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ message: 'No nodes in workflow' }),
      )
      expect(result.status).toBe('has-issues')
    })
  })

  // ── single ──

  describe('single', () => {
    it('produces 1 completed path for a single node', () => {
      const result = simulateWorkflow([makeStepNode('a')], [])
      expect(result.paths).toHaveLength(1)
      expect(result.paths[0]!.steps).toHaveLength(1)
      expect(result.paths[0]!.completed).toBe(true)
      expect(result.nodesVisited).toBe(1)
    })
  })

  // ── linear ──

  describe('linear', () => {
    it('produces 1 path with 3 steps for A → B → C', () => {
      const nodes = [makeStepNode('a'), makeStepNode('b'), makeStepNode('c')]
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths).toHaveLength(1)
      expect(result.paths[0]!.steps).toHaveLength(3)
      expect(result.paths[0]!.completed).toBe(true)
      expect(result.nodesVisited).toBe(3)
      expect(result.unreachedNodeIds).toHaveLength(0)
    })
  })

  // ── branch ──

  describe('branch', () => {
    it('produces 2 paths for a 2-way branch with targets', () => {
      const branchNode = makeFlowNode({
        id: 'b1',
        type: 'branch',
        name: 'Check',
        position: { x: 0, y: 0 },
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      })
      const nodes = [branchNode, makeStepNode('t1', 'Yes Target'), makeStepNode('t2', 'No Target')]
      const edges = [makeEdge('b1', 't1', 'yes'), makeEdge('b1', 't2', 'no')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths).toHaveLength(2)
      expect(result.paths.every((p) => p.completed)).toBe(true)
    })

    it('reports issue when branch has a disconnected target', () => {
      const branchNode = makeFlowNode({
        id: 'b1',
        type: 'branch',
        name: 'Check',
        position: { x: 0, y: 0 },
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      })
      // Only connect "yes" branch
      const nodes = [branchNode, makeStepNode('t1')]
      const edges = [makeEdge('b1', 't1', 'yes')]
      const result = simulateWorkflow(nodes, edges)
      // Should still produce paths for the connected branch
      expect(result.paths.length).toBeGreaterThanOrEqual(1)
    })

    it('reports issue when all branches are disconnected', () => {
      const branchNode = makeFlowNode({
        id: 'b1',
        type: 'branch',
        name: 'Check',
        position: { x: 0, y: 0 },
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      })
      const result = simulateWorkflow([branchNode], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ message: 'Branch "Check" has no connected targets' }),
      )
      expect(result.paths[0]!.completed).toBe(false)
    })
  })

  // ── parallel ──

  describe('parallel', () => {
    it('produces 2 paths for parallel with 2 outgoing edges', () => {
      const parallelNode = makeFlowNode({
        id: 'p1',
        type: 'parallel',
        name: 'Fan Out',
        position: { x: 0, y: 0 },
      })
      const nodes = [parallelNode, makeStepNode('t1'), makeStepNode('t2')]
      const edges = [makeEdge('p1', 't1'), makeEdge('p1', 't2')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths).toHaveLength(2)
      expect(result.paths.every((p) => p.completed)).toBe(true)
    })

    it('reports issue when parallel has 0 outgoing edges', () => {
      const parallelNode = makeFlowNode({
        id: 'p1',
        type: 'parallel',
        name: 'Fan Out',
        position: { x: 0, y: 0 },
      })
      const result = simulateWorkflow([parallelNode], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ message: 'Parallel "Fan Out" has no outgoing edges' }),
      )
    })
  })

  // ── combined ──

  describe('combined', () => {
    it('multiplies path count for branch then parallel', () => {
      const branchNode = makeFlowNode({
        id: 'b1',
        type: 'branch',
        name: 'Check',
        position: { x: 0, y: 0 },
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      })
      const parallelNode = makeFlowNode({
        id: 'p1',
        type: 'parallel',
        name: 'Fan Out',
        position: { x: 0, y: 0 },
      })
      const nodes = [
        branchNode,
        parallelNode,
        makeStepNode('t1'),
        makeStepNode('t2'),
        makeStepNode('t3'),
      ]
      // branch yes → parallel, branch no → t3
      // parallel → t1, parallel → t2
      const edges = [
        makeEdge('b1', 'p1', 'yes'),
        makeEdge('b1', 't3', 'no'),
        makeEdge('p1', 't1'),
        makeEdge('p1', 't2'),
      ]
      const result = simulateWorkflow(nodes, edges)
      // yes → parallel → t1, yes → parallel → t2, no → t3 = 3 paths
      expect(result.paths).toHaveLength(3)
    })
  })

  // ── cycle ──

  describe('cycle', () => {
    it('detects cycle and reports issue', () => {
      const nodes = [makeStepNode('a'), makeStepNode('b')]
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('Cycle detected') }),
      )
      expect(result.paths[0]!.completed).toBe(false)
    })
  })

  // ── unreachable ──

  describe('unreachable', () => {
    it('lists disconnected node in unreachedNodeIds', () => {
      const nodes = [makeStepNode('a'), makeStepNode('b'), makeStepNode('c')]
      const edges = [makeEdge('a', 'b')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.unreachedNodeIds).toContain('c')
    })
  })

  // ── labels ──

  describe('labels', () => {
    it('builds path label with arrow separators', () => {
      const nodes = [makeStepNode('a', 'Alpha'), makeStepNode('b', 'Beta')]
      const edges = [makeEdge('a', 'b')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths[0]!.label).toBe('Alpha → Beta')
    })

    it('includes branch label in path label', () => {
      const branchNode = makeFlowNode({
        id: 'b1',
        type: 'branch',
        name: 'Check',
        position: { x: 0, y: 0 },
        branches: [{ label: 'yes', condition: 'true' }, { label: 'no', condition: '' }],
      })
      const nodes = [branchNode, makeStepNode('t1', 'Target')]
      const edges = [makeEdge('b1', 't1', 'yes')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths[0]!.label).toContain('[yes]')
    })

    it('includes parallel label in path label', () => {
      const parallelNode = makeFlowNode({
        id: 'p1',
        type: 'parallel',
        name: 'Fan Out',
        position: { x: 0, y: 0 },
      })
      const nodes = [parallelNode, makeStepNode('t1', 'Worker')]
      const edges = [makeEdge('p1', 't1')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths[0]!.label).toContain('[parallel: Worker]')
    })
  })

  // ── status ──

  describe('status', () => {
    it('step produces executed status', () => {
      const result = simulateWorkflow([makeStepNode('a')], [])
      expect(result.paths[0]!.steps[0]!.status).toBe('executed')
    })

    it('sleep produces skipped-instant status', () => {
      const node = makeFlowNode({
        id: 's1',
        type: 'sleep',
        name: 'Wait',
        position: { x: 0, y: 0 },
        duration: '10 seconds',
      })
      const result = simulateWorkflow([node], [])
      expect(result.paths[0]!.steps[0]!.status).toBe('skipped-instant')
    })

    it('sleep-until produces skipped-instant status', () => {
      const node = makeFlowNode({
        id: 's1',
        type: 'sleep-until',
        name: 'Wait',
        position: { x: 0, y: 0 },
        timestamp: '2026-06-01T00:00:00Z',
      })
      const result = simulateWorkflow([node], [])
      expect(result.paths[0]!.steps[0]!.status).toBe('skipped-instant')
    })

    it('http-request produces executed status', () => {
      const node = makeFlowNode({
        id: 'h1',
        type: 'http-request',
        name: 'Fetch',
        position: { x: 0, y: 0 },
        url: 'https://api.example.com',
        method: 'POST',
      })
      const result = simulateWorkflow([node], [])
      expect(result.paths[0]!.steps[0]!.status).toBe('executed')
      expect(result.paths[0]!.steps[0]!.detail).toBe('HTTP POST https://api.example.com (simulated)')
    })

    it('wait-for-event produces event-received status', () => {
      const node = makeFlowNode({
        id: 'w1',
        type: 'wait-for-event',
        name: 'Wait',
        position: { x: 0, y: 0 },
        eventType: 'my-event',
      })
      const result = simulateWorkflow([node], [])
      expect(result.paths[0]!.steps[0]!.status).toBe('event-received')
    })

    it('branch produces executed status', () => {
      const node = makeFlowNode({
        id: 'b1',
        type: 'branch',
        name: 'Check',
        position: { x: 0, y: 0 },
        branches: [{ label: 'yes', condition: 'true' }, { label: 'no', condition: '' }],
      })
      const nodes = [node, makeStepNode('t1')]
      const edges = [makeEdge('b1', 't1', 'yes')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths[0]!.steps[0]!.status).toBe('executed')
    })

    it('parallel produces executed status', () => {
      const node = makeFlowNode({
        id: 'p1',
        type: 'parallel',
        name: 'Fan Out',
        position: { x: 0, y: 0 },
      })
      const nodes = [node, makeStepNode('t1')]
      const edges = [makeEdge('p1', 't1')]
      const result = simulateWorkflow(nodes, edges)
      expect(result.paths[0]!.steps[0]!.status).toBe('executed')
    })
  })
})
