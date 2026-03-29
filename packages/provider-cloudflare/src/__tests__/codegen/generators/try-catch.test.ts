import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateTryCatch } from '../../../codegen/generators/try-catch.js'
import { generateNodeCode } from '../../../codegen/generate.js'

const V = '1.0.0'
const P = 'cloudflare'

function node(id: string, name: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: { code: `return "${id}";` },
    ...overrides,
  }
}

function makeTryCatchIR(
  targets: { node: WorkflowNode; label: string }[],
  extraEdges: WorkflowIR['edges'] = [],
): WorkflowIR {
  const tryNode: WorkflowNode = {
    id: 'tc-1',
    type: 'try_catch',
    name: 'Error Handler',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: {},
  }

  return {
    metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
    nodes: [tryNode, ...targets.map((t) => t.node)],
    edges: [
      ...targets.map((t, i) => ({
        id: `e${i}`,
        source: 'tc-1',
        target: t.node.id,
        label: t.label,
      })),
      ...extraEdges,
    ],
    entryNodeId: 'tc-1',
  }
}

describe('generateTryCatch', () => {
  it('generates try/catch blocks', () => {
    const ir = makeTryCatchIR([
      { node: node('charge', 'Charge Payment'), label: 'try' },
      { node: node('refund', 'Refund Order'), label: 'catch' },
    ])
    const code = generateTryCatch(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('try {')
    expect(code).toContain('Charge Payment')
    expect(code).toContain('} catch (err) {')
    expect(code).toContain('Refund Order')
    expect(code).toContain('}')
  })

  it('generates try/catch/finally blocks', () => {
    const ir = makeTryCatchIR([
      { node: node('work', 'Do Work'), label: 'try' },
      { node: node('handle', 'Handle Error'), label: 'catch' },
      { node: node('cleanup', 'Cleanup'), label: 'finally' },
    ])
    const code = generateTryCatch(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('try {')
    expect(code).toContain('Do Work')
    expect(code).toContain('} catch (err) {')
    expect(code).toContain('Handle Error')
    expect(code).toContain('} finally {')
    expect(code).toContain('Cleanup')
  })

  it('generates chain within try path', () => {
    const step1 = node('s1', 'Step 1')
    const step2 = node('s2', 'Step 2')
    const ir = makeTryCatchIR(
      [
        { node: step1, label: 'try' },
        { node: node('err', 'Error Handler'), label: 'catch' },
      ],
      [{ id: 'chain', source: 's1', target: 's2' }],
    )
    ir.nodes.push(step2)
    const code = generateTryCatch(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('Step 1')
    expect(code).toContain('Step 2')
  })

  it('handles empty catch path gracefully', () => {
    const ir = makeTryCatchIR([{ node: node('work', 'Do Work'), label: 'try' }])
    // Manually add catch edge with no target in nodes — just testing the structure
    ir.edges.push({ id: 'catch-edge', source: 'tc-1', target: 'missing', label: 'catch' })
    const code = generateTryCatch(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('try {')
    expect(code).toContain('} catch (err) {')
    expect(code).toContain('}')
  })
})
