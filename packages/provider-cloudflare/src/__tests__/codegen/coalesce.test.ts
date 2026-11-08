import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { workflowSource } from './bundle-source.js'
import { groupChain, isCoalescible } from '@awaitstep/codegen'
import { generateWorkflowBundle } from '../../codegen/generate.js'

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  extra: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type,
    name: `Node ${id}`,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
    ...extra,
  }
}

function linearIR(nodes: WorkflowNode[]): WorkflowIR {
  return {
    metadata: { name: 'CoalesceDemo', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: nodes[0]!.id,
    nodes,
    edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: n.id })),
  }
}

describe('isCoalescible', () => {
  it('accepts plain config-less step nodes only', () => {
    expect(isCoalescible(node('a', 'step', { code: 'return 1;' }))).toBe(true)
    expect(isCoalescible(node('a', 'http_request', { url: 'https://x' }))).toBe(false)
    expect(isCoalescible(node('a', 'step', { code: 'return 1;', inline: true }))).toBe(false)
    expect(
      isCoalescible(node('a', 'step', { code: 'return 1;' }, { config: { timeout: '1 minute' } })),
    ).toBe(false)
    expect(isCoalescible(node('a', 'step', { code: 'return 1;', retryLimit: 3 }))).toBe(false)
  })

  it('treats a step whose retry delay was cleared like a plain one', () => {
    // The canvas used to write retryDelay: '' on a blur; such a step now groups with its neighbours.
    expect(isCoalescible(node('a', 'step', { code: 'return 1;', retryDelay: '' }))).toBe(true)
    expect(isCoalescible(node('a', 'step', { code: 'return 1;', timeout: '  ' }))).toBe(true)
  })

  it('honors the coalesce: false opt-out for side-effectful steps', () => {
    expect(isCoalescible(node('a', 'step', { code: 'return 1;', coalesce: false }))).toBe(false)
  })
})

describe('groupChain', () => {
  it('merges maximal runs of adjacent coalescible steps', () => {
    const ir = linearIR([
      node('a', 'step', { code: 'return 1;' }),
      node('b', 'step', { code: 'return 2;' }),
      node('c', 'sleep', { duration: '1 minute' }),
      node('d', 'step', { code: 'return 3;' }),
    ])
    const groups = groupChain(ir.nodes, ir).map((g) => g.map((n) => n.id))
    expect(groups).toEqual([['a', 'b'], ['c'], ['d']])
  })

  it('never merges across labeled edges (container continuations)', () => {
    const ir = linearIR([
      node('a', 'step', { code: 'return 1;' }),
      node('b', 'step', { code: 'return 2;' }),
    ])
    ir.edges[0]!.label = 'then'
    const groups = groupChain(ir.nodes, ir).map((g) => g.map((n) => n.id))
    expect(groups).toEqual([['a'], ['b']])
  })

  it('never merges into a fan-in node', () => {
    const ir = linearIR([
      node('a', 'step', { code: 'return 1;' }),
      node('b', 'step', { code: 'return 2;' }),
    ])
    ir.nodes.push(node('x', 'step', { code: 'return 0;' }))
    ir.edges.push({ id: 'ex', source: 'x', target: 'b' })
    const groups = groupChain(ir.nodes, ir).map((g) => g.map((n) => n.id))
    expect(groups).toContainEqual(['a'])
    expect(groups).toContainEqual(['b'])
  })
})

describe('coalesced bundle emission', () => {
  // varNames derive from node names: Node_a, Node_b, Node_c, Node_d.
  // a→b→c coalesce; d carries retry config, so it stays its own step and is
  // the group's only OUTSIDE consumer (of Node_b).
  const ir = linearIR([
    node('a', 'step', { code: 'return 1;' }),
    node('b', 'step', { code: 'return Node_a + 1;' }),
    node('c', 'step', { code: 'console.log(Node_b);' }),
    node(
      'd',
      'step',
      { code: 'return Node_b * 2;' },
      {
        config: { retries: { limit: 3, delay: '5 seconds' } },
      },
    ),
  ])

  it('emits one step.do for the whole group under the leader label', () => {
    const bundle = generateWorkflowBundle(ir)
    const entry = workflowSource(bundle)
    expect(entry.match(/flow\.step\(/g)).toHaveLength(2) // group + configured d
    expect(entry).toContain('flow.step("a"')
    expect(entry).toContain('flow.step("d"')
  })

  it('stores only outside-consumed members; intra-group refs stay local consts', () => {
    const bundle = generateWorkflowBundle(ir)
    const entry = workflowSource(bundle)
    // Node_b is read by d (outside the group) → returned and destructured.
    // Node_a is only read inside the group → local const, not stored.
    expect(entry).toContain('const { Node_b } = await flow.step("a"')
    expect(entry).toContain('return { Node_b };')
    expect(entry).toContain('const Node_a = await')
    expect(entry).not.toContain('return { Node_a')
    // b consumes a, c consumes b — both through module inputs in scope.
    expect(entry).toContain('inputs: { Node_a }')
    expect(entry).toContain('inputs: { Node_b }')
  })

  it('still emits one module file per member', () => {
    const bundle = generateWorkflowBundle(ir)
    const modulePaths = bundle.files.filter((f) => f.role === 'module').map((f) => f.path)
    expect(modulePaths.sort()).toEqual([
      'awaitstep/entry.ts',
      'awaitstep/env.ts',
      'awaitstep/platform.ts',
      'awaitstep/runtime.ts',
      'awaitstep/workflow.ts',
      'steps/a.ts',
      'steps/b.ts',
      'steps/c.ts',
      'steps/d.ts',
    ])
  })

  it('records the label on the group leader only; members keep node identity', () => {
    const bundle = generateWorkflowBundle(ir)
    const steps = bundle.manifest!.steps
    expect(steps.map((s) => s.nodeId)).toEqual(['a', 'b', 'c', 'd'])
    expect(steps[0]).toMatchObject({ stepName: 'a', kind: 'do' })
    expect(steps[1]!.stepName).toBeUndefined()
    expect(steps[2]!.stepName).toBeUndefined()
    // Members link to the leader so run telemetry can attribute the merged
    // step record to them.
    expect(steps[1]!.coalescedInto).toBe('a')
    expect(steps[2]!.coalescedInto).toBe('a')
    expect(steps[0]!.coalescedInto).toBeUndefined()
    expect(steps[3]).toMatchObject({ stepName: 'd', kind: 'do' })
    expect(steps[3]!.coalescedInto).toBeUndefined()
  })
})
