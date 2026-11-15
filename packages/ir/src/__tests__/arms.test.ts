import { describe, expect, it } from 'vitest'
import {
  isArmEdgeOf,
  openArmSlots,
  validateArmsIntoJoins,
  waitArmEdgeOverridden,
  withoutWaitArmTo,
} from '../arms.js'
import { validateIR } from '../validate.js'
import branchingWorkflow from './fixtures/branching-workflow.json'

function node(id: string, type = 'step') {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: type === 'branch' ? { branches: [] } : { code: 'return 1;' },
  }
}

function doc(nodes: ReturnType<typeof node>[], edges: unknown[]) {
  return {
    metadata: {
      name: 'w',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes,
    edges,
    entryNodeId: nodes[0]!.id,
  }
}

describe('isArmEdgeOf', () => {
  it('counts labelled arms for loops, try/catch and waits, and every non-then edge otherwise', () => {
    expect(isArmEdgeOf('loop', 'body')).toBe(true)
    expect(isArmEdgeOf('loop', 'then')).toBe(false)
    expect(isArmEdgeOf('try_catch', 'finally')).toBe(true)
    expect(isArmEdgeOf('wait_for_event', 'onTimeout')).toBe(true)
    expect(isArmEdgeOf('wait_for_event', undefined)).toBe(false)
    expect(isArmEdgeOf('parallel', undefined)).toBe(true)
    expect(isArmEdgeOf('branch', 'then')).toBe(false)
    expect(isArmEdgeOf('step', undefined)).toBe(false)
  })
})

describe('validateArmsIntoJoins', () => {
  it('refuses an arm leading straight into a node another path also reaches', () => {
    const result = validateIR(
      doc(
        [node('br', 'branch'), node('yy'), node('jj')],
        [
          { id: 'a', source: 'br', target: 'jj', label: 'a' },
          { id: 'b', source: 'br', target: 'yy', label: 'b' },
          { id: 'yj', source: 'yy', target: 'jj' },
        ],
      ),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual({
      path: 'edges.a',
      message:
        'br’s “a” arm leads straight into jj, which another path also reaches. Add a step to that arm first.',
      nodeId: 'br',
    })
  })

  it('refuses an arm leading into the container’s own way on', () => {
    const errors = validateArmsIntoJoins(
      doc(
        [node('br', 'branch'), node('ss')],
        [
          { id: 'a', source: 'br', target: 'ss', label: 'a' },
          { id: 't', source: 'br', target: 'ss', label: 'then' },
        ],
      ),
    )
    expect(errors.map((e) => e.path)).toEqual(['edges.a'])
  })

  it('accepts arms that merge after a step each, and a then edge into a join', () => {
    expect(
      validateArmsIntoJoins(
        doc(
          [node('br', 'branch'), node('xx'), node('yy'), node('jj'), node('zz')],
          [
            { id: 'a', source: 'br', target: 'xx', label: 'a' },
            { id: 'b', source: 'br', target: 'yy', label: 'b' },
            { id: 'xj', source: 'xx', target: 'jj' },
            { id: 'yj', source: 'yy', target: 'jj' },
            { id: 't', source: 'br', target: 'zz', label: 'then' },
            { id: 'jz', source: 'jj', target: 'zz' },
          ],
        ),
      ),
    ).toEqual([])
  })

  it('reports a container and node once, caps the list, and cuts long labels', () => {
    const fanIn = Array.from({ length: 3 }, (_, i) => ({
      id: `e${i}`,
      source: 'p',
      target: 'jj',
      label: 'x'.repeat(100),
    }))
    const once = validateArmsIntoJoins(doc([node('p', 'parallel'), node('jj')], fanIn))
    expect(once).toHaveLength(1)
    expect(once[0]!.message).toBe(
      `p’s “${'x'.repeat(40)}…” arm leads straight into jj, which another path also reaches. Add a step to that arm first.`,
    )

    const containers = Array.from({ length: 60 }, (_, i) => node(`b${i}`, 'branch'))
    const many = validateArmsIntoJoins(
      doc(
        [...containers, node('jj')],
        containers.map((c) => ({ id: `${c.id}-j`, source: c.id, target: 'jj', label: 'a' })),
      ),
    )
    expect(many).toHaveLength(51)
    expect(many.at(-1)).toEqual({
      path: 'edges',
      message: '10 more arms lead straight into a step another path also reaches.',
    })
  })

  it('accepts the branching fixture', () => {
    expect(
      validateArmsIntoJoins(branchingWorkflow as Parameters<typeof validateArmsIntoJoins>[0]),
    ).toEqual([])
  })
})

describe('openArmSlots', () => {
  const exists = () => true

  it('lists a wait’s missing arms and its way on after them', () => {
    const wait = { type: 'wait_for_event', data: {} }
    expect(openArmSlots(wait, [{ label: 'onEvent' }], exists)).toEqual([
      { label: 'onTimeout' },
      { label: 'then' },
    ])
    expect(
      openArmSlots(wait, [{ label: 'onEvent' }, { label: 'onTimeout' }, { label: 'then' }], exists),
    ).toEqual([])
  })

  it('counts a wait arm chosen in its field as filled, unless the node is gone', () => {
    const wait = { type: 'wait_for_event', data: { onTimeoutNode: 'late' } }
    const filled = [{ label: 'onEvent' }, { label: 'then' }]
    expect(openArmSlots(wait, filled, exists)).toEqual([])
    expect(openArmSlots(wait, filled, () => false)).toEqual([{ label: 'onTimeout' }])
  })

  it('lists a loop’s body and then, and a try/catch’s missing arms in order', () => {
    expect(openArmSlots({ type: 'loop', data: {} }, [], exists)).toEqual([
      { label: 'body' },
      { label: 'then' },
    ])
    expect(
      openArmSlots({ type: 'try_catch', data: {} }, [{ label: 'try' }, { label: 'then' }], exists),
    ).toEqual([{ label: 'catch' }, { label: 'finally' }])
  })

  it('lists each branch condition with no connection, once', () => {
    const branch = {
      type: 'branch',
      data: {
        branches: [
          { label: 'yes', condition: 'a' },
          { label: 'no', condition: '' },
          { label: 'no', condition: '' },
        ],
      },
    }
    expect(openArmSlots(branch, [{ label: 'yes' }], exists)).toEqual([
      { label: 'no' },
      { label: 'then' },
    ])
  })

  it('always offers a parallel or race a new arm', () => {
    expect(
      openArmSlots({ type: 'parallel', data: {} }, [{}, {}, { label: 'then' }], exists),
    ).toEqual([{ label: null }])
    expect(openArmSlots({ type: 'race', data: {} }, [], exists)).toEqual([
      { label: null },
      { label: 'then' },
    ])
  })

  it('gives a plain node nothing', () => {
    expect(openArmSlots({ type: 'step', data: {} }, [], exists)).toEqual([])
  })
})

describe('waitArmEdgeOverridden', () => {
  const exists = () => true
  const wait = { type: 'wait_for_event', data: { onEventNode: 'other' } }

  it('is true only when the field names another node that exists', () => {
    expect(waitArmEdgeOverridden(wait, { label: 'onEvent', target: 's' }, exists)).toBe(true)
    expect(waitArmEdgeOverridden(wait, { label: 'onEvent', target: 'other' }, exists)).toBe(false)
    expect(waitArmEdgeOverridden(wait, { label: 'onEvent', target: 's' }, () => false)).toBe(false)
    expect(waitArmEdgeOverridden(wait, { label: 'onTimeout', target: 's' }, exists)).toBe(false)
    expect(
      waitArmEdgeOverridden({ type: 'loop', data: {} }, { label: 'body', target: 's' }, exists),
    ).toBe(false)
  })
})

describe('withoutWaitArmTo', () => {
  const wait = { type: 'wait_for_event', data: { onEventNode: 'x', onTimeoutNode: 'x' } }

  it('clears every field naming the node, or only the arm given', () => {
    expect(withoutWaitArmTo(wait, 'x').data).toEqual({ onEventNode: '', onTimeoutNode: '' })
    expect(withoutWaitArmTo(wait, 'x', 'onTimeout').data).toEqual({
      onEventNode: 'x',
      onTimeoutNode: '',
    })
  })

  it('returns the same node when nothing names it', () => {
    expect(withoutWaitArmTo(wait, 'y')).toBe(wait)
    const step = { type: 'step', data: {} }
    expect(withoutWaitArmTo(step, 'x')).toBe(step)
  })
})
