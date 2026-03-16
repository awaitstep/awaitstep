import { describe, it, expect } from 'vitest'
import type { WorkflowIR, ParallelNode, StepNode } from '@awaitstep/ir'
import { generateParallel } from '../../../codegen/generators/parallel.js'
import { generateNodeCode } from '../../../codegen/generate.js'

function makeIR(parallelTargets: StepNode[]): WorkflowIR {
  const parallel: ParallelNode = {
    id: 'parallel-1',
    type: 'parallel',
    name: 'Run in parallel',
    position: { x: 0, y: 0 },
  }

  return {
    metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
    nodes: [parallel, ...parallelTargets],
    edges: parallelTargets.map((t, i) => ({
      id: `e${i}`,
      source: 'parallel-1',
      target: t.id,
    })),
    entryNodeId: 'parallel-1',
  }
}

describe('generateParallel', () => {
  it('generates Promise.all with branches', () => {
    const ir = makeIR([
      { id: 'a', type: 'step', name: 'Task A', position: { x: 0, y: 0 }, code: 'return "a";' },
      { id: 'b', type: 'step', name: 'Task B', position: { x: 0, y: 0 }, code: 'return "b";' },
    ])
    const node = ir.nodes[0] as ParallelNode
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('Promise.all')
    expect(code).toContain('Task A')
    expect(code).toContain('Task B')
    expect(code).toContain('async () => {')
  })

  it('handles single branch', () => {
    const ir = makeIR([
      { id: 'a', type: 'step', name: 'Only task', position: { x: 0, y: 0 }, code: 'return 1;' },
    ])
    const node = ir.nodes[0] as ParallelNode
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('Promise.all')
    expect(code).toContain('Only task')
  })

  it('returns comment for no branches', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [{ id: 'parallel-1', type: 'parallel', name: 'Empty', position: { x: 0, y: 0 } }],
      edges: [],
      entryNodeId: 'parallel-1',
    }
    const node = ir.nodes[0] as ParallelNode
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toBe('// parallel: no branches')
  })

  it('maps and calls each branch function', () => {
    const ir = makeIR([
      { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 }, code: 'return 1;' },
      { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 0 }, code: 'return 2;' },
    ])
    const node = ir.nodes[0] as ParallelNode
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('.map(fn => fn())')
  })
})
