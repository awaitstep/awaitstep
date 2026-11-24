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

describe('a node edit with its name and connections', () => {
  const wait = node('w', 'Wait', 'wait_for_event', { eventType: 'sunny', timeout: '30 seconds' })
  const base = () =>
    graph(
      [wait, node('s', 'Sunny'), node('late', 'Late')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )

  // Regression: an edited edge was rebuilt from id/source/target/label only,
  // so a Code edit lost the canvas sides the same canvas edit keeps.
  it('keeps an edited edge’s canvas sides, dropping the entry side when its target moves', () => {
    const pinned = graph(
      [wait, node('s', 'Sunny'), node('late', 'Late')],
      [
        {
          id: 'e1',
          source: 'w',
          target: 's',
          label: 'onEvent',
          sourceSide: 'right',
          targetSide: 'top',
        },
        {
          id: 'e2',
          source: 'w',
          target: 'late',
          label: 'onTimeout',
          sourceSide: 'right',
          targetSide: 'left',
        },
      ],
    )
    const op: GraphOp = {
      kind: 'fields',
      nodeId: 'w',
      base: wait.data,
      edited: wait.data,
      edges: {
        base: [
          { id: 'e1', target: 's', label: 'onEvent' },
          { id: 'e2', target: 'late', label: 'onTimeout' },
        ],
        edited: [
          { id: 'e1', target: 'late', label: 'onEvent' },
          { id: 'e2', target: 'late', label: 'then' },
        ],
      },
    }
    const result = applyGraphOp(pinned, op)
    if (!result.ok) throw new Error(result.reason)
    expect(result.ir.edges).toEqual([
      { id: 'e1', source: 'w', target: 'late', label: 'onEvent', sourceSide: 'right' },
      {
        id: 'e2',
        source: 'w',
        target: 'late',
        label: 'then',
        sourceSide: 'right',
        targetSide: 'left',
      },
    ])
  })

  it('connects an arm, retargets one, and renames, as the canvas panel does', () => {
    const op: GraphOp = {
      kind: 'fields',
      nodeId: 'w',
      base: wait.data,
      edited: { ...wait.data, onTimeoutNode: 'late' },
      name: { base: 'Wait', edited: 'Wait for sun' },
      edges: {
        base: [{ id: 'e1', target: 's', label: 'onEvent' }],
        edited: [
          { id: 'e1', target: 'late', label: 'onEvent' },
          { id: 'e2', target: 's', label: 'onTimeout' },
        ],
      },
    }
    const result = applyGraphOp(base(), op)
    if (!result.ok) throw new Error(result.reason)
    expect(result.ir.nodes[0]).toMatchObject({
      name: 'Wait for sun',
      data: { onTimeoutNode: 'late' },
    })
    expect(result.ir.edges).toEqual([
      { id: 'e1', source: 'w', target: 'late', label: 'onEvent' },
      { id: 'e2', source: 'w', target: 's', label: 'onTimeout' },
    ])
  })

  it('removes a connection, and leaves one it didn’t touch as someone else left it', () => {
    const moved = graph(
      [wait, node('s', 'Sunny'), node('late', 'Late')],
      [
        { id: 'e1', source: 'w', target: 'late', label: 'onEvent' },
        { id: 'e3', source: 'w', target: 's', label: 'then' },
      ],
    )
    const op: GraphOp = {
      kind: 'fields',
      nodeId: 'w',
      base: wait.data,
      edited: wait.data,
      edges: {
        base: [
          { id: 'e1', target: 's', label: 'onEvent' },
          { id: 'e3', target: 's', label: 'then' },
        ],
        edited: [{ id: 'e1', target: 's', label: 'onEvent' }],
      },
    }
    const result = applyGraphOp(moved, op)
    if (!result.ok) throw new Error(result.reason)
    // e1 untouched by this edit keeps the newer target; e3 goes.
    expect(result.ir.edges).toEqual([{ id: 'e1', source: 'w', target: 'late', label: 'onEvent' }])
  })

  it('refuses a connection to a node that is gone', () => {
    const op: GraphOp = {
      kind: 'fields',
      nodeId: 'w',
      base: wait.data,
      edited: wait.data,
      edges: { base: [], edited: [{ id: 'e9', target: 'ghost', label: 'onTimeout' }] },
    }
    expect(applyGraphOp(base(), op)).toEqual({
      ok: false,
      reason: 'It connects to a node that is not in this version any more.',
    })
  })

  it('moves step functions with a rename', () => {
    const step = node('a', 'Fetch', 'step', { code: stepModuleTemplate('Fetch') })
    const op: GraphOp = {
      kind: 'fields',
      nodeId: 'a',
      base: step.data,
      edited: step.data,
      name: { base: 'Fetch', edited: 'Load' },
    }
    const result = applyGraphOp(graph([step], []), op)
    if (!result.ok) throw new Error(result.reason)
    expect(String(result.ir.nodes[0]!.data.code)).toContain('function Load(')
  })
})

describe('a node edit replayed on a version that moved', () => {
  const tc = node('t', 'Guard', 'try_catch')
  const saved = () =>
    graph(
      [tc, node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')],
      [
        { id: 'e1', source: 't', target: 'a', label: 'try' },
        { id: 'e2', source: 't', target: 'b', label: 'catch' },
        { id: 'e3', source: 't', target: 'c', label: 'then' },
      ],
    )
  const retargetThen: GraphOp = {
    kind: 'fields',
    nodeId: 't',
    base: {},
    edited: {},
    edges: {
      base: [
        { id: 'e1', target: 'a', label: 'try' },
        { id: 'e2', target: 'b', label: 'catch' },
        { id: 'e3', target: 'c', label: 'then' },
      ],
      edited: [
        { id: 'e1', target: 'a', label: 'try' },
        { id: 'e2', target: 'b', label: 'catch' },
        { id: 'e3', target: 'd', label: 'then' },
      ],
    },
  }

  it('still applies when an arm it didn’t touch lost its target', () => {
    const moved = saved()
    moved.nodes = moved.nodes.filter((n) => n.id !== 'b')
    moved.edges = moved.edges.filter((e) => e.id !== 'e2')
    const result = applyGraphOp(moved, retargetThen)
    if (!result.ok) throw new Error(result.reason)
    expect(result.ir.edges.find((e) => e.label === 'then')?.target).toBe('d')
  })

  it('is refused rather than leave two connections under one label', () => {
    const moved = saved()
    moved.edges = [
      ...moved.edges.filter((e) => e.id !== 'e3'),
      { id: 'e9', source: 't', target: 'c', label: 'then' },
    ]
    expect(applyGraphOp(moved, retargetThen)).toEqual({
      ok: false,
      reason: 'Its “then” connection was changed in this version meanwhile.',
    })
  })
})
