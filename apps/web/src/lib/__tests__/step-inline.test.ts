import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { stepCodeForInline } from '../step-inline'

function node(id: string, type = 'step', data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cf', data }
}

describe('stepCodeForInline', () => {
  const ir = {
    kind: 'workflow',
    entryNodeId: 'first',
    nodes: [
      node('first', 'step', { code: 'return 1;' }),
      node('each', 'loop', { loopType: 'forEach', itemVar: 'item', collection: 'rows' }),
      node('body', 'step', {
        code: 'export default async function body({ env, event, inputs, step, ctx }) {\n  return inputs.item.price;\n}\n',
      }),
      // A step inside the loop is scoped to its block; `first` is what `after` can read.
      node('after', 'step', { code: 'return first;', inline: true }),
    ],
    edges: [
      { id: 'e0', source: 'first', target: 'each' },
      { id: 'e1', source: 'each', target: 'body', label: 'body' },
      { id: 'e2', source: 'each', target: 'after', label: 'then' },
    ],
  }

  it('turns a module into the statements an inline step holds, reading the block’s own names', () => {
    expect(stepCodeForInline(ir, 'body', true)).toBe('return item.price;\n')
  })

  it('turns statements into the module, taking what they read from inputs', () => {
    expect(stepCodeForInline(ir, 'after', false)).toBe(
      'export default async function after({ env, event, inputs, step, ctx }) {\n  const { first } = inputs;\n  return first;\n}\n',
    )
  })

  it('leaves other kinds and unknown nodes alone', () => {
    expect(stepCodeForInline(ir, 'each', true)).toBe('')
    expect(stepCodeForInline(ir, 'ghost', false)).toBe('')
  })
})
