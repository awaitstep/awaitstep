import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateTryCatch } from '@awaitstep/codegen'
import { recurseWithTestCtx as generateNodeCode, testCtx as ctx } from '../test-context.js'

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
    const code = generateTryCatch(ir.nodes[0]!, ir, ctx, generateNodeCode)
    expect(code).toContain('try {')
    expect(code).toContain('flow.step("charge"')
    expect(code).toContain('} catch (err) {')
    expect(code).toContain('flow.step("refund"')
    expect(code).toContain('}')
  })

  it('generates try/catch/finally blocks', () => {
    const ir = makeTryCatchIR([
      { node: node('work', 'Do Work'), label: 'try' },
      { node: node('handle', 'Handle Error'), label: 'catch' },
      { node: node('cleanup', 'Cleanup'), label: 'finally' },
    ])
    const code = generateTryCatch(ir.nodes[0]!, ir, ctx, generateNodeCode)
    expect(code).toContain('try {')
    expect(code).toContain('flow.step("work"')
    expect(code).toContain('} catch (err) {')
    expect(code).toContain('flow.step("handle"')
    expect(code).toContain('} finally {')
    expect(code).toContain('flow.step("cleanup"')
  })

  it('coalesces an adjacent plain-step chain within the try path', () => {
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
    const code = generateTryCatch(ir.nodes[0]!, ir, ctx, generateNodeCode)
    // One merged billable step under the leader's label; both results stay
    // referenceable (container children never lean-prune their returns).
    expect(code).toContain('const { s1, s2 } = await flow.step("s1"')
    expect(code).not.toContain('flow.step("s2"')
  })

  it('handles empty catch path gracefully', () => {
    const ir = makeTryCatchIR([{ node: node('work', 'Do Work'), label: 'try' }])
    // Manually add catch edge with no target in nodes — just testing the structure
    ir.edges.push({ id: 'catch-edge', source: 'tc-1', target: 'missing', label: 'catch' })
    const code = generateTryCatch(ir.nodes[0]!, ir, ctx, generateNodeCode)
    expect(code).toContain('try {')
    expect(code).toContain('} catch (err) {')
    expect(code).toContain('}')
  })
})
