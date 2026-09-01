import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateParallel } from '../../../codegen/generators/parallel.js'
import { generateNodeCode } from '../../../codegen/generate.js'

const V = '1.0.0'
const P = 'cloudflare'

function makeIR(parallelTargets: WorkflowNode[]): WorkflowIR {
  const parallel: WorkflowNode = {
    id: 'parallel-1',
    type: 'parallel',
    name: 'Run in parallel',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: {},
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
  it('generates Promise.allSettled with branches', () => {
    const ir = makeIR([
      {
        id: 'a',
        type: 'step',
        name: 'Task A',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'return "a";' },
      },
      {
        id: 'b',
        type: 'step',
        name: 'Task B',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'return "b";' },
      },
    ])
    const node = ir.nodes[0]!
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('Promise.allSettled')
    expect(code).toContain('Task A')
    expect(code).toContain('Task B')
    expect(code).toContain('async () => {')
  })

  it('handles single branch', () => {
    const ir = makeIR([
      {
        id: 'a',
        type: 'step',
        name: 'Only task',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'return 1;' },
      },
    ])
    const node = ir.nodes[0]!
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('Promise.allSettled')
    expect(code).toContain('Only task')
  })

  it('returns comment for no branches', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        {
          id: 'parallel-1',
          type: 'parallel',
          name: 'Empty',
          position: { x: 0, y: 0 },
          version: V,
          provider: P,
          data: {},
        },
      ],
      edges: [],
      entryNodeId: 'parallel-1',
    }
    const node = ir.nodes[0]!
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toBe('// parallel: no branches')
  })

  it('wraps Promise.allSettled in step.do for durable caching', () => {
    const ir = makeIR([
      {
        id: 'a',
        type: 'step',
        name: 'A',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'return 1;' },
      },
    ])
    const node = ir.nodes[0]!
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('await step.do("Run in parallel"')
    expect(code).toContain('return await Promise.allSettled')
  })

  it('returns each branch step variable so allSettled values are usable', () => {
    // Regression: branches of `async () => { const X = await step.do(...) }`
    // had no return statement, so allSettled resolved every branch to
    // `undefined`. Branches that bind a variable (i.e. step has `return` in
    // body) must surface that var as the branch's promise value.
    const ir = makeIR([
      {
        id: 'title',
        type: 'step',
        name: 'title',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'return listing.title;' },
      },
      {
        id: 'desc',
        type: 'step',
        name: 'description',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'return listing.description;' },
      },
    ])
    const node = ir.nodes[0]!
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).toContain('return title;')
    expect(code).toContain('return desc;')
  })

  it('omits return for side-effect-only branch steps', () => {
    // Step nodes without a `return` in their code don't get a `const X =`
    // prefix, so there's nothing meaningful to surface; the branch resolves
    // to undefined as before.
    const ir = makeIR([
      {
        id: 'log',
        type: 'step',
        name: 'log',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'console.log("noop");' },
      },
    ])
    const node = ir.nodes[0]!
    const code = generateParallel(node, ir, generateNodeCode)
    expect(code).not.toMatch(/return\s+log\b/)
  })
})
