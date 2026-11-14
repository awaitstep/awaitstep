import { describe, expect, it } from 'vitest'
import { validateArtifact, type ArtifactIR, type Edge, type WorkflowNode } from '@awaitstep/ir'
import { applyGraphOp, applyGraphOps, withFieldEdits, type GraphOp } from '../graph-ops.js'
import { stepModuleTemplate } from '../step-module.js'

function node(
  id: string,
  name: string,
  type = 'step',
  data: Record<string, unknown> = {},
): WorkflowNode {
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

function graph(nodes: WorkflowNode[], edges: Edge[], entryNodeId = nodes[0]?.id ?? ''): ArtifactIR {
  return {
    kind: 'workflow',
    irVersion: 3,
    metadata: {
      name: 'Test',
      version: 1,
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T00:00:00.000Z',
    },
    nodes,
    edges,
    entryNodeId,
  }
}

const chain = () =>
  graph(
    [
      node('a', 'Fetch user', 'step', { code: stepModuleTemplate('fetchUser') }),
      node('x', 'Say hello', 'custom:hello', { greeting: 'hi', retries: 1 }),
      node('b', 'Notify', 'step', { code: stepModuleTemplate('notify') }),
    ],
    [
      { id: 'e1', source: 'a', target: 'x' },
      { id: 'e2', source: 'x', target: 'b' },
    ],
  )

const insertAfter = (after: string, id: string, name: string): GraphOp => ({
  kind: 'insert',
  placement: { after },
  node: { id, name, type: 'step' },
})

describe('applyGraphOps — replay', () => {
  it('replays every operation in order onto the loaded document', () => {
    const ops: GraphOp[] = [
      insertAfter('a', 'load', 'Load profile'),
      { kind: 'remove', nodeId: 'x' },
      { kind: 'fields', nodeId: 'load', edited: { timeout: '5s' }, base: {} },
    ]
    const { ir, dropped } = applyGraphOps(chain(), ops)
    expect(dropped).toEqual([])
    expect(ir.nodes.map((n) => n.id)).toEqual(['a', 'b', 'load'])
    expect(ir.edges).toEqual([
      { id: 'load-in', source: 'a', target: 'load' },
      { id: 'load-out', source: 'load', target: 'b' },
    ])
    expect(ir.nodes.find((n) => n.id === 'load')?.data.timeout).toBe('5s')
    expect(validateArtifact(ir).ok).toBe(true)
  })

  it('places a node after one an earlier operation added', () => {
    const { ir, dropped } = applyGraphOps(chain(), [
      insertAfter('b', 'one', 'One'),
      insertAfter('one', 'two', 'Two'),
    ])
    expect(dropped).toEqual([])
    expect(ir.edges.slice(-2)).toEqual([
      { id: 'one-out', source: 'b', target: 'one' },
      { id: 'two-out', source: 'one', target: 'two' },
    ])
  })

  it('leaves the loaded document untouched', () => {
    const base = chain()
    const before = JSON.stringify(base)
    applyGraphOps(base, [insertAfter('a', 'n', 'New'), { kind: 'remove', nodeId: 'b' }])
    expect(JSON.stringify(base)).toBe(before)
  })

  it('returns the same document for no operations', () => {
    const base = chain()
    expect(applyGraphOps(base, []).ir).toBe(base)
  })
})

describe('applyGraphOps — operations that no longer apply', () => {
  it('drops an operation whose node is gone and keeps the rest', () => {
    const base = chain()
    // The canvas removed `x` underneath.
    const moved = graph([base.nodes[0]!, base.nodes[2]!], [{ id: 'e1', source: 'a', target: 'b' }])
    const { ir, dropped } = applyGraphOps(moved, [
      { kind: 'fields', nodeId: 'x', edited: { retries: 3 }, base: { retries: 1 } },
      insertAfter('a', 'n', 'New'),
      { kind: 'remove', nodeId: 'x' },
    ])
    expect(dropped).toEqual([
      { index: 0, reason: 'That node is not in this version any more.' },
      { index: 2, reason: 'That node is not in this version any more.' },
    ])
    expect(ir.nodes.map((n) => n.id)).toEqual(['a', 'b', 'n'])
  })

  it('drops an insert whose connection moved', () => {
    const moved = graph(chain().nodes, [
      { id: 'e9', source: 'a', target: 'x' },
      { id: 'e2', source: 'x', target: 'b' },
    ])
    const { dropped } = applyGraphOps(moved, [
      {
        kind: 'insert',
        placement: { after: 'a', edgeId: 'e1' },
        node: { id: 'n', name: 'N', type: 'step' },
      },
    ])
    expect(dropped).toEqual([
      { index: 0, reason: 'That connection is not in this version any more.' },
    ])
  })

  it('drops an operation that depends on a dropped one', () => {
    const { ir, dropped } = applyGraphOps(chain(), [
      insertAfter('gone', 'one', 'One'),
      insertAfter('one', 'two', 'Two'),
    ])
    expect(dropped.map((d) => d.index)).toEqual([0, 1])
    expect(ir.nodes.map((n) => n.id)).toEqual(['a', 'x', 'b'])
  })

  it('drops an insert whose id the base now holds', () => {
    const { dropped } = applyGraphOps(chain(), [insertAfter('a', 'b', 'Clash')])
    expect(dropped).toEqual([
      { index: 0, reason: 'A node with that id is already in this version.' },
    ])
  })
})

describe('applyGraphOps — names that shift across operations', () => {
  const twins = () =>
    graph(
      [
        node('first', 'Load', 'step', { code: stepModuleTemplate('Load') }),
        node('second', 'Load', 'step', { code: stepModuleTemplate('Load_2') }),
        node('end', 'End', 'step', { code: stepModuleTemplate('End') }),
      ],
      [
        { id: 'e1', source: 'first', target: 'second' },
        { id: 'e2', source: 'second', target: 'end' },
      ],
    )

  it('renames the surviving twin’s function when the first one is removed', () => {
    const { ir } = applyGraphOps(twins(), [{ kind: 'remove', nodeId: 'first' }])
    expect(ir.nodes.find((n) => n.id === 'second')?.data.code).toBe(stepModuleTemplate('Load'))
  })

  it('names a later insert from the names the removal left', () => {
    const { ir, dropped } = applyGraphOps(twins(), [
      { kind: 'remove', nodeId: 'first' },
      insertAfter('end', 'third', 'Load'),
    ])
    expect(dropped).toEqual([])
    expect(ir.nodes.find((n) => n.id === 'third')?.data.code).toBe(stepModuleTemplate('Load_2'))
  })
})

describe('applyGraphOp', () => {
  it('refuses a field edit on a node the document lacks', () => {
    expect(applyGraphOp(chain(), { kind: 'fields', nodeId: 'nope', edited: {}, base: {} })).toEqual(
      { ok: false, reason: 'That node is not in this version any more.' },
    )
  })

  it('refuses removing a node Code cannot remove', () => {
    const result = applyGraphOp(chain(), { kind: 'remove', nodeId: 'b' })
    expect(result.ok).toBe(true)
    const single = graph([node('only', 'Only')], [])
    expect(applyGraphOp(single, { kind: 'remove', nodeId: 'only' })).toEqual({
      ok: false,
      reason: 'A workflow needs at least one node. Add another first.',
    })
  })

  it('writes only the changed fields onto the node as the document holds it', () => {
    const base = chain()
    base.nodes[1] = { ...base.nodes[1]!, data: { greeting: 'hello', retries: 1 } }
    const result = applyGraphOp(base, {
      kind: 'fields',
      nodeId: 'x',
      edited: { greeting: 'hi', retries: 4 },
      base: { greeting: 'hi', retries: 1 },
    })
    expect(result.ok && result.ir.nodes[1]!.data).toEqual({ greeting: 'hello', retries: 4 })
  })
})

describe('withFieldEdits', () => {
  it('applies only fields that differ between base and edited, removing unset ones', () => {
    expect(
      withFieldEdits({ a: 1, b: 9, c: 3, d: 4 }, { a: 2, b: 2, d: 4 }, { a: 1, b: 2, c: 3, d: 4 }),
    ).toEqual({ a: 2, b: 9, d: 4 })
  })
})

describe('applyGraphOps — a pending step keeps its first scaffold', () => {
  it('replays a step with the code it was recorded with, whatever names the base holds', () => {
    const recorded = stepModuleTemplate('Load')
    const base = graph([node('a', 'Load', 'step', { code: stepModuleTemplate('Load') })], [])
    const { ir } = applyGraphOps(base, [
      {
        kind: 'insert',
        placement: { after: 'a' },
        node: { id: 'b', name: 'Load', type: 'step', data: { code: recorded } },
      },
    ])
    // The base already holds a "Load", so a fresh scaffold would be Load_2.
    expect(ir.nodes.find((n) => n.id === 'b')?.data.code).toBe(recorded)
  })
})
