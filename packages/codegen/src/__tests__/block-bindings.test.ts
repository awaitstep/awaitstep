import { describe, expect, it } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { blockBindingsOf, loopBindings } from '../block-bindings.js'
import { containerArms } from '../dag.js'

function node(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cf', data }
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

describe('loopBindings', () => {
  it('binds the item under its configured name and the index for a forEach, the index alone otherwise', () => {
    expect(loopBindings(node('l', 'loop', { loopType: 'forEach', itemVar: 'row' }))).toEqual({
      row: 'row',
      index: '_loop_i',
    })
    expect(loopBindings(node('l', 'loop', { loopType: 'forEach' }))).toEqual({
      item: 'item',
      index: '_loop_i',
    })
    expect(loopBindings(node('l', 'loop', { loopType: 'times' }))).toEqual({ index: '_loop_i' })
  })
})

describe('blockBindingsOf', () => {
  it('gives a loop body step the item and index, a catch step the error, nested blocks merged with the inner one winning', () => {
    const ir = graph(
      [
        node('top', 'step', { code: 'return 1;' }),
        node('loop', 'loop', { loopType: 'forEach', itemVar: 'item' }),
        node('body', 'step', { code: 'return 1;' }),
        node('tc', 'try_catch'),
        node('try_step', 'step', { code: 'return 1;' }),
        node('catch_step', 'step', { code: 'return 1;' }),
        node('inner', 'loop', { loopType: 'forEach', itemVar: 'error' }),
        node('inner_step', 'step', { code: 'return 1;' }),
      ],
      [
        { id: 'e1', source: 'top', target: 'loop' },
        { id: 'e2', source: 'loop', target: 'body', label: 'body' },
        { id: 'e3', source: 'top', target: 'tc' },
        { id: 'e4', source: 'tc', target: 'try_step', label: 'try' },
        { id: 'e5', source: 'tc', target: 'catch_step', label: 'catch' },
        { id: 'e6', source: 'catch_step', target: 'inner' },
        { id: 'e7', source: 'inner', target: 'inner_step', label: 'body' },
      ],
    )
    const bindings = blockBindingsOf(ir, containerArms(ir))
    expect(bindings('top')).toEqual({})
    expect(bindings('body')).toEqual({ item: 'item', index: '_loop_i' })
    expect(bindings('try_step')).toEqual({})
    expect(bindings('catch_step')).toEqual({ error: 'err' })
    // The inner loop names its item `error`: inside it, that is what `error` means.
    expect(bindings('inner_step')).toEqual({ error: 'error', index: '_loop_i' })
  })
})
