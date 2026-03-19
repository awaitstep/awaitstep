import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode, BranchCondition } from '@awaitstep/ir'
import { generateBranch, collectBranchInlineTargets } from '../../../codegen/generators/branch.js'
import { generateNodeCode } from '../../../codegen/generate.js'

const V = '1.0.0'
const P = 'cloudflare'

function makeIR(branches: BranchCondition[], targets: { node: WorkflowNode; label: string }[], extraEdges: WorkflowIR['edges'] = []): WorkflowIR {
  const branchNode: WorkflowNode = {
    id: 'branch-1',
    type: 'branch',
    name: 'Check condition',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: { branches },
  }

  return {
    metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
    nodes: [branchNode, ...targets.map((t) => t.node)],
    edges: [
      ...targets.map((t, i) => ({
        id: `e${i}`,
        source: 'branch-1',
        target: t.node.id,
        label: t.label,
      })),
      ...extraEdges,
    ],
    entryNodeId: 'branch-1',
  }
}

describe('generateBranch', () => {
  it('generates if/else branches', () => {
    const ir = makeIR(
      [
        { label: 'yes', condition: 'state.active === true' },
        { label: 'no', condition: '' },
      ],
      [
        { node: { id: 'a', type: 'step', name: 'Active path', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "yes";' } }, label: 'yes' },
        { node: { id: 'b', type: 'step', name: 'Fallback', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "no";' } }, label: 'no' },
      ],
    )
    const node = ir.nodes[0]!
    const code = generateBranch(node, ir, generateNodeCode)
    expect(code).toContain('if (state.active === true) {')
    expect(code).toContain('} else {')
    expect(code).toContain('Active path')
    expect(code).toContain('Fallback')
  })

  it('generates if/else if/else chain', () => {
    const ir = makeIR(
      [
        { label: 'high', condition: 'state.score > 90' },
        { label: 'mid', condition: 'state.score > 50' },
        { label: 'low', condition: '' },
      ],
      [
        { node: { id: 'a', type: 'step', name: 'High', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "high";' } }, label: 'high' },
        { node: { id: 'b', type: 'step', name: 'Mid', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "mid";' } }, label: 'mid' },
        { node: { id: 'c', type: 'step', name: 'Low', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "low";' } }, label: 'low' },
      ],
    )
    const node = ir.nodes[0]!
    const code = generateBranch(node, ir, generateNodeCode)
    expect(code).toContain('if (state.score > 90) {')
    expect(code).toContain('} else if (state.score > 50) {')
    expect(code).toContain('} else {')
  })

  it('generates single condition without else', () => {
    const ir = makeIR(
      [{ label: 'yes', condition: 'state.enabled' }],
      [
        { node: { id: 'a', type: 'step', name: 'Run', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return 1;' } }, label: 'yes' },
      ],
    )
    const node = ir.nodes[0]!
    const code = generateBranch(node, ir, generateNodeCode)
    expect(code).toContain('if (state.enabled) {')
    expect(code).toContain('}')
    expect(code).not.toContain('else')
  })

  it('handles branch with no matching target', () => {
    const ir = makeIR(
      [{ label: 'yes', condition: 'true' }],
      [],
    )
    const node = ir.nodes[0]!
    const code = generateBranch(node, ir, generateNodeCode)
    expect(code).toContain('if (true) {')
    expect(code).toContain('}')
  })

  it('generates full chain within a branch arm', () => {
    const sleepNode: WorkflowNode = {
      id: 'wait', type: 'sleep', name: 'Wait', position: { x: 0, y: 0 }, version: V, provider: P, data: { duration: '30 second' },
    }
    const logNode: WorkflowNode = {
      id: 'log', type: 'step', name: 'Log', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "done";' },
    }
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        { id: 'branch-1', type: 'branch', name: 'Check', position: { x: 0, y: 0 }, version: V, provider: P, data: { branches: [{ label: 'yes', condition: 'true' }] } },
        sleepNode,
        logNode,
      ],
      edges: [
        { id: 'e0', source: 'branch-1', target: 'wait', label: 'yes' },
        { id: 'e1', source: 'wait', target: 'log' },
      ],
      entryNodeId: 'branch-1',
    }
    const node = ir.nodes[0]!
    const code = generateBranch(node, ir, generateNodeCode)
    expect(code).toContain('step.sleep("Wait"')
    expect(code).toContain('step.do("Log"')
  })

  it('stops chain at nodes with in-degree > 1', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        { id: 'branch-1', type: 'branch', name: 'Check', position: { x: 0, y: 0 }, version: V, provider: P, data: { branches: [{ label: 'a', condition: 'true' }, { label: 'b', condition: '' }] } },
        { id: 'step-a', type: 'step', name: 'A', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "a";' } },
        { id: 'step-b', type: 'step', name: 'B', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "b";' } },
        { id: 'join', type: 'step', name: 'Join', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return "join";' } },
      ],
      edges: [
        { id: 'e0', source: 'branch-1', target: 'step-a', label: 'a' },
        { id: 'e1', source: 'branch-1', target: 'step-b', label: 'b' },
        { id: 'e2', source: 'step-a', target: 'join' },
        { id: 'e3', source: 'step-b', target: 'join' },
      ],
      entryNodeId: 'branch-1',
    }
    const node = ir.nodes[0]!
    const code = generateBranch(node, ir, generateNodeCode)
    expect(code).not.toContain('Join')
    expect(code).toContain('step.do("A"')
    expect(code).toContain('step.do("B"')
  })
})

describe('collectBranchInlineTargets', () => {
  it('collects chain nodes as inline targets', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        { id: 'branch-1', type: 'branch', name: 'Check', position: { x: 0, y: 0 }, version: V, provider: P, data: { branches: [{ label: 'yes', condition: 'true' }] } },
        { id: 'step-a', type: 'step', name: 'A', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return 1;' } },
        { id: 'step-b', type: 'step', name: 'B', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return 2;' } },
      ],
      edges: [
        { id: 'e0', source: 'branch-1', target: 'step-a', label: 'yes' },
        { id: 'e1', source: 'step-a', target: 'step-b' },
      ],
      entryNodeId: 'branch-1',
    }
    const inlineTargets = collectBranchInlineTargets(ir)
    expect(inlineTargets.has('step-a')).toBe(true)
    expect(inlineTargets.has('step-b')).toBe(true)
    expect(inlineTargets.has('branch-1')).toBe(false)
  })

  it('does not include join nodes with in-degree > 1', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        { id: 'branch-1', type: 'branch', name: 'Check', position: { x: 0, y: 0 }, version: V, provider: P, data: { branches: [{ label: 'a', condition: 'true' }, { label: 'b', condition: '' }] } },
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return 1;' } },
        { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return 2;' } },
        { id: 'join', type: 'step', name: 'Join', position: { x: 0, y: 0 }, version: V, provider: P, data: { code: 'return 3;' } },
      ],
      edges: [
        { id: 'e0', source: 'branch-1', target: 'a', label: 'a' },
        { id: 'e1', source: 'branch-1', target: 'b', label: 'b' },
        { id: 'e2', source: 'a', target: 'join' },
        { id: 'e3', source: 'b', target: 'join' },
      ],
      entryNodeId: 'branch-1',
    }
    const inlineTargets = collectBranchInlineTargets(ir)
    expect(inlineTargets.has('a')).toBe(true)
    expect(inlineTargets.has('b')).toBe(true)
    expect(inlineTargets.has('join')).toBe(false)
  })
})
