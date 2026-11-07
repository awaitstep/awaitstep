import { describe, expect, it } from 'vitest'
import { stepSourcePath } from '@awaitstep/ir'
import type { WorkflowNode } from '@awaitstep/ir'
import { orderSteps, type OrderEdge } from '../ide/step-order'
import {
  afterChoices,
  beforeChoices,
  placementKey,
  stepFileStem,
  uniqueStepId,
} from '../ide/step-flow-choices'
import { placementChoices } from '../ide/step-placements'

function node(id: string, name: string, type = 'step'): WorkflowNode {
  return { id, type, name, version: '1.0.0', provider: 'cloudflare', data: {} }
}
function graph(nodes: WorkflowNode[], edges: OrderEdge[]) {
  const rows = orderSteps(
    nodes.map((n, i) => ({ id: n.id, type: n.type, position: { x: 0, y: i * 80 } })),
    edges,
  )
  return {
    rows,
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges: edges.map((e, i) => ({ id: `e${i + 1}`, ...e })),
  }
}

describe('step flow choices', () => {
  it('keys after/first/edge placements without collisions', () => {
    expect(placementKey({ first: true })).toBe('first')
    expect(placementKey({ after: 'a' })).toBe(JSON.stringify(['a', null]))
    expect(placementKey({ after: 'a', edgeId: 'e1' })).toBe(JSON.stringify(['a', 'e1']))
  })

  it('keeps only plain after choices', () => {
    const g = graph(
      [node('a', 'A'), node('b', 'B'), node('g', 'Gate', 'branch')],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'g' },
      ],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(afterChoices(choices).map((c) => c.nodeId)).toEqual(['a', 'b', 'g'])
  })

  it('offers before the entry, or before a node with one incoming edge', () => {
    const g = graph(
      [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'a', target: 'c' },
      ],
    )
    const list = beforeChoices(g.rows, g.nodes, g.edges, 'a')
    expect(list.map((choice) => [choice.nodeName, choice.placement])).toEqual([
      ['A', { first: true }],
      ['B', { after: 'a', edgeId: 'e1' }],
      // C has two incoming edges, so it has no single "before".
    ])
    expect(list.some((choice) => choice.nodeName === 'D')).toBe(false)
  })

  it('drops a before whose only incoming edge id is shared', () => {
    const shared = [
      { id: 'dup', source: 'a', target: 'b' },
      { id: 'dup', source: 'c', target: 'd' },
    ]
    const rows = orderSteps(
      [
        { id: 'a', type: 'step', position: { x: 0, y: 0 } },
        { id: 'b', type: 'step', position: { x: 0, y: 80 } },
        { id: 'c', type: 'step', position: { x: 0, y: 0 } },
        { id: 'd', type: 'step', position: { x: 0, y: 80 } },
      ],
      shared,
    )
    const nodes = new Map([
      ['a', node('a', 'A')],
      ['b', node('b', 'B')],
      ['c', node('c', 'C')],
      ['d', node('d', 'D')],
    ])
    const list = beforeChoices(rows, nodes, shared, 'a')
    // The entry still has its first choice; B/D have no safe splice.
    expect(list.map((choice) => choice.nodeName)).toEqual(['A'])
  })

  it('derives a safe .ts stem', () => {
    expect(stepFileStem('Notify ops')).toBe('notify_ops')
    expect(stepFileStem('   ')).toBe('new_step')
  })

  it('makes a unique, lowercase id from the step name', () => {
    const taken = new Map([
      ['notify_ops', {}],
      ['notify_ops_2', {}],
    ])
    expect(uniqueStepId('Notify ops', new Map())).toBe('notify_ops')
    expect(uniqueStepId('Notify ops', taken)).toBe('notify_ops_3')
    expect(uniqueStepId('***', new Map())).toBe('new_step')
    expect(uniqueStepId('Charge card', new Map([['charge_card', {}]]))).toBe('charge_card_2')
    expect(uniqueStepId('Notify ops', new Map(), new Set(['notify_ops']))).toBe('notify_ops_2')
    expect(stepSourcePath('notify_ops')).toBe('steps/notify_ops.ts')
    expect(stepSourcePath('charge_card_2')).toBe('steps/charge_card_2.ts')
    expect(uniqueStepId('x'.repeat(300), new Map())).toHaveLength(55)
  })
})
