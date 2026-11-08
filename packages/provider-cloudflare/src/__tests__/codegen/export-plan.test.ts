import { describe, expect, it } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { boundVarNames, exportPlan, nodeYieldsValue } from '@awaitstep/codegen'
import { computeVarNames } from '@awaitstep/codegen'

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  name = id,
): WorkflowNode {
  return { id, type, name, position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cf', data }
}

function graph(nodes: WorkflowNode[], edges: WorkflowIR['edges']): WorkflowIR {
  return {
    kind: 'workflow',
    metadata: { name: 'g', version: 1, createdAt: '', updatedAt: '' },
    nodes,
    edges,
    entryNodeId: nodes[0]!.id,
    trigger: { type: 'http' },
  } as WorkflowIR
}

describe('nodeYieldsValue', () => {
  it('counts a step by a return in its code, not in a comment, and never an inline or flow-only node', () => {
    const ir = graph([node('a', 'step', { code: 'return 1;' })], [])
    expect(nodeYieldsValue(ir, node('a', 'step', { code: 'return 1;' }))).toBe(true)
    expect(nodeYieldsValue(ir, node('a', 'step', { code: '// return later\nlog();' }))).toBe(false)
    expect(nodeYieldsValue(ir, node('a', 'step', { code: 'return 1;', inline: true }))).toBe(false)
    expect(nodeYieldsValue(ir, node('b', 'branch'))).toBe(false)
    expect(nodeYieldsValue(ir, node('c', 'http_request'))).toBe(true)
  })

  it('gives a loop a value only when a step directly in its body returns one', () => {
    // loop → branch → arm step: the arm step's const is scoped to the branch's
    // block, so the loop cannot capture it. Only a direct body step counts.
    const ir = graph(
      [
        node('loop', 'loop', { loopType: 'forEach', itemVar: 'item', collection: 'rows' }),
        node('pick', 'branch', { branches: [{ label: 'yes', condition: 'true' }] }),
        node('deep', 'step', { code: 'return inputs.item;' }),
        node('other', 'loop', { loopType: 'times', count: 2 }),
        node('direct', 'step', { code: 'return 1;' }),
      ],
      [
        { id: 'e1', source: 'loop', target: 'pick', label: 'body' },
        { id: 'e2', source: 'pick', target: 'deep', label: 'yes' },
        { id: 'e3', source: 'loop', target: 'other', label: 'then' },
        { id: 'e4', source: 'other', target: 'direct', label: 'body' },
      ],
    )
    expect(nodeYieldsValue(ir, ir.nodes[0]!)).toBe(false)
    expect(nodeYieldsValue(ir, ir.nodes[3]!)).toBe(true)
  })
})

describe('boundVarNames', () => {
  it('binds the nodes whose variable holds a value and an inline step that declares its own', () => {
    const ir = graph(
      [
        node('a', 'step', { code: 'return 1;' }),
        node('b', 'step', { code: 'log();' }),
        node('c', 'step', { code: 'const c = 2;', inline: true }),
        node('d', 'branch'),
      ],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'd' },
      ],
    )
    expect([...boundVarNames(ir, computeVarNames(ir.nodes)).keys()]).toEqual(['a', 'c'])
  })
})

describe('exportPlan', () => {
  it('returns switched-on and always-returned nodes under their own names first, explicit keys deduplicated in run order', () => {
    const ir = graph(
      [
        node('a', 'step', { code: 'return 1;', export: true, exportAs: 'result' }),
        node('b', 'step', { code: 'return 2;', export: true }),
        node('c', 'step', { code: 'return 3;', export: true, exportAs: 'b' }),
        node('d', 'step', { code: 'log();', export: true }),
        node('e', 'http_request', { url: 'https://x' }),
        node('f', 'step', { code: 'return 6;', exportAs: 'ignored' }),
      ],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'd' },
        { id: 'e4', source: 'd', target: 'e' },
        { id: 'e5', source: 'e', target: 'f' },
      ],
    )
    const plan = exportPlan(ir)
    expect([...plan.values()]).toEqual([
      { nodeId: 'b', varName: 'b', key: 'b' },
      { nodeId: 'e', varName: 'e', key: 'e' },
      { nodeId: 'a', varName: 'a', key: 'result' },
      { nodeId: 'c', varName: 'c', key: 'b_2' },
    ])
  })

  it('refuses a key that is not an identifier, falling back to the variable name', () => {
    const ir = graph(
      [node('a', 'step', { code: 'return 1;', export: true, exportAs: '__proto__' })],
      [],
    )
    expect(exportPlan(ir).get('a')).toEqual({ nodeId: 'a', varName: 'a', key: 'a' })
  })
})
