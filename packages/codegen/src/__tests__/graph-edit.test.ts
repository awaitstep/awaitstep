import { describe, expect, it } from 'vitest'
import { validateArtifact, type ArtifactIR, type Edge, type WorkflowNode } from '@awaitstep/ir'
import { insertStep, type NewStep, type StepPlacement } from '../graph-edit.js'
import { stepModuleProblems } from '../step-module.js'

function node(
  id: string,
  name: string,
  type = 'step',
  position: { x: number; y: number } | undefined = { x: 0, y: 0 },
): WorkflowNode {
  return {
    id,
    type,
    name,
    ...(position && { position }),
    version: '1.0.0',
    provider: 'cloudflare',
    data: {},
  }
}

function graph(nodes: WorkflowNode[], edges: Edge[], entryNodeId = nodes[0]?.id ?? ''): ArtifactIR {
  return {
    kind: 'workflow',
    irVersion: 2,
    metadata: {
      name: 'Test',
      version: 1,
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    },
    nodes,
    edges,
    entryNodeId,
  }
}

const NEW: NewStep = { id: 'newstep00000', name: 'Charge card' }

function insert(ir: ArtifactIR, placement: StepPlacement, next: NewStep = NEW) {
  const result = insertStep(ir, placement, next)
  if (!result.ok) throw new Error(`expected a document, got: ${result.reason}`)
  return result.ir
}

function codeOf(ir: ArtifactIR, id: string): string {
  return String(ir.nodes.find((n) => n.id === id)?.data.code ?? '')
}

const TEMPLATE = (name: string) =>
  `export default async function ${name}({ env, event, inputs, step, ctx }) {\n  // Write your business logic here\n\n  return { result: "ok" };\n}\n`

describe('insertStep — splicing into an edge', () => {
  it('puts the step between A and B, on A’s only connection', () => {
    const ir = graph(
      [node('a', 'Fetch user'), node('b', 'Send mail')],
      [{ id: 'e1', source: 'a', target: 'b' }],
    )
    const next = insert(ir, { after: 'a' })
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'b', NEW.id])
    expect(next.edges.map((e) => [e.source, e.target])).toEqual([
      ['a', NEW.id],
      [NEW.id, 'b'],
    ])
    expect(next.entryNodeId).toBe('a')
    expect(codeOf(next, NEW.id)).toBe(TEMPLATE('Charge_card'))
  })

  it('keeps the edge label on the first edge, as the canvas does', () => {
    const ir = graph(
      [node('try', 'Try', 'try_catch'), node('x', 'X'), node('catch', 'Catch')],
      [
        { id: 'e1', source: 'try', target: 'x', label: 'try' },
        { id: 'e2', source: 'try', target: 'catch', label: 'catch' },
      ],
    )
    const result = insertStep(ir, { after: 'try', edgeId: 'e1' }, NEW)
    if (!result.ok) throw new Error(result.reason)
    const first = result.ir.edges.find((e) => e.source === 'try')!
    const second = result.ir.edges.find((e) => e.source === NEW.id)!
    expect(first.label).toBe('try')
    expect(first.target).toBe(NEW.id)
    expect(second.label).toBeUndefined()
    expect(second.target).toBe('x')
    // The arm not chosen is untouched.
    expect(result.ir.edges.find((e) => e.target === 'catch')?.label).toBe('catch')
  })

  it('replaces the edge in place, leaving the source’s other connections in order', () => {
    const ir = graph(
      [node('gate', 'Gate', 'branch'), node('a', 'A'), node('b', 'B')],
      [
        { id: 'e1', source: 'gate', target: 'a', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'b', label: 'no' },
      ],
    )
    const next = insert(ir, { after: 'gate', edgeId: 'e1' })
    expect(next.edges.map((e) => e.source)).toEqual(['gate', NEW.id, 'gate'])
    expect(next.edges[1]!.target).toBe('a')
  })

  it('appends after a step with nothing after it', () => {
    const ir = graph([node('a', 'A'), node('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const next = insert(ir, { after: 'b' })
    expect(next.edges.map((e) => [e.source, e.target])).toEqual([
      ['a', 'b'],
      ['b', NEW.id],
    ])
  })

  it('refuses to pick an arm when the step has several connections', () => {
    const ir = graph(
      [node('gate', 'Gate', 'branch'), node('a', 'A'), node('b', 'B')],
      [
        { id: 'e1', source: 'gate', target: 'a', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'b', label: 'no' },
      ],
    )
    const result = insertStep(ir, { after: 'gate' }, NEW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/more than one outgoing connection/)
  })
})

describe('insertStep — refusals', () => {
  const ir = graph(
    [node('a', 'A'), node('b', 'B')],
    [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
    ],
  )

  it('refuses a node that is not in the version', () => {
    const result = insertStep(ir, { after: 'gone' }, NEW)
    expect(result).toEqual({ ok: false, reason: 'That step is not in this version any more.' })
  })

  it('refuses an edge that is not in the version', () => {
    const result = insertStep(ir, { after: 'a', edgeId: 'gone' }, NEW)
    expect(result).toEqual({
      ok: false,
      reason: 'That connection is not in this version any more.',
    })
  })

  it('refuses an edge that does not leave the named step', () => {
    const result = insertStep(ir, { after: 'a', edgeId: 'e2' }, NEW)
    expect(result).toEqual({ ok: false, reason: 'That connection does not leave this step.' })
  })

  it('refuses a connection id that names two edges', () => {
    // The API does not require edge ids to be unique; splicing by one would
    // silently drop the other connection.
    const duplicated = graph(
      [node('a', 'A'), node('b', 'B'), node('c', 'C')],
      [
        { id: 'dup', source: 'a', target: 'b' },
        { id: 'dup', source: 'a', target: 'c' },
      ],
    )
    const result = insertStep(duplicated, { after: 'a', edgeId: 'dup' }, NEW)
    expect(result).toEqual({ ok: false, reason: 'That connection is not unique in this version.' })
  })

  it('refuses an automatic splice onto an edge id that names two edges', () => {
    // `after` with one outgoing edge picks that edge without an explicit id;
    // its id can still be shared with an edge elsewhere.
    const duplicated = graph(
      [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')],
      [
        { id: 'dup', source: 'a', target: 'b' },
        { id: 'dup', source: 'c', target: 'd' },
      ],
    )
    const result = insertStep(duplicated, { after: 'a' }, NEW)
    expect(result).toEqual({ ok: false, reason: 'That connection is not unique in this version.' })
  })

  it('refuses an empty name', () => {
    const result = insertStep(ir, { after: 'a' }, { id: 'x', name: '   ' })
    expect(result).toEqual({ ok: false, reason: 'Give the step a name.' })
  })

  it('refuses an id already in the version', () => {
    const result = insertStep(ir, { after: 'a' }, { id: 'a', name: 'Another' })
    expect(result.ok).toBe(false)
  })

  it('refuses an empty id', () => {
    const result = insertStep(ir, { after: 'a' }, { id: '', name: 'Another' })
    expect(result).toEqual({ ok: false, reason: 'The step needs an id.' })
  })
})

describe('insertStep — the front of the graph', () => {
  it('makes the step the entry of an empty graph', () => {
    const next = insert(graph([], []), { first: true })
    expect(next.nodes.map((n) => n.id)).toEqual([NEW.id])
    expect(next.edges).toEqual([])
    expect(next.entryNodeId).toBe(NEW.id)
    expect(next.nodes[0]!.position).toEqual({ x: 80, y: 80 })
  })

  it('puts the step before the entry, left of it, and makes it the entry', () => {
    const ir = graph([node('a', 'A', 'step', { x: 280, y: 40 })], [], 'a')
    const next = insert(ir, { first: true })
    expect(next.edges.map((e) => [e.source, e.target])).toEqual([[NEW.id, 'a']])
    expect(next.entryNodeId).toBe(NEW.id)
    expect(next.nodes.find((n) => n.id === NEW.id)!.position).toEqual({ x: 0, y: 40 })
  })

  it('refuses when a non-empty graph has no entry node', () => {
    const ir = graph([node('a', 'A')], [], 'missing')
    const result = insertStep(ir, { first: true }, NEW)
    expect(result.ok).toBe(false)
  })
})

describe('insertStep — names and positions', () => {
  it('deduplicates against existing names without renaming them', () => {
    const ir = graph([node('a', 'Charge card')], [])
    const next = insert(ir, { after: 'a' })
    expect(codeOf(next, NEW.id)).toBe(TEMPLATE('Charge_card_2'))
    // The existing step's code is untouched; new nodes always go at the end.
    expect(codeOf(next, 'a')).toBe('')
    expect(next.nodes.map((n) => n.id)).toEqual(['a', NEW.id])
  })

  it('suffixes a reserved name', () => {
    const next = insert(graph([], []), { first: true }, { id: 'x', name: 'fetch' })
    expect(codeOf(next, 'x')).toBe(TEMPLATE('fetch_node'))
  })

  it('trims the display name', () => {
    const next = insert(graph([], []), { first: true }, { id: 'x', name: '  Fetch user  ' })
    expect(next.nodes[0]!.name).toBe('Fetch user')
    expect(codeOf(next, 'x')).toBe(TEMPLATE('Fetch_user'))
  })

  it('places the new step one column right of its predecessor', () => {
    const ir = graph([node('a', 'A', 'step', { x: 200, y: 80 })], [])
    const next = insert(ir, { after: 'a' })
    expect(next.nodes.find((n) => n.id === NEW.id)!.position).toEqual({ x: 480, y: 80 })
  })

  it('falls back when the predecessor has no position', () => {
    const noPosition = node('a', 'A')
    delete noPosition.position
    const ir = graph([noPosition], [])
    const next = insert(ir, { after: 'a' })
    expect(next.nodes.find((n) => n.id === NEW.id)!.position).toEqual({ x: 80, y: 80 })
  })

  it('does not mutate the document it was given', () => {
    const ir = graph([node('a', 'A')], [])
    const before = JSON.parse(JSON.stringify(ir))
    insert(ir, { after: 'a' })
    expect(ir).toEqual(before)
  })

  it('keeps new edge ids clear of the ones already stored', () => {
    const ir = graph(
      [node('a', 'A'), node('b', 'B')],
      [{ id: `${NEW.id}-in`, source: 'a', target: 'b' }],
    )
    const next = insert(ir, { after: 'a' })
    const ids = next.edges.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(`${NEW.id}-in`)
  })

  it('refuses a name longer than the node schema allows', () => {
    const result = insertStep(graph([], []), { first: true }, { id: 'x', name: 'a'.repeat(257) })
    expect(result).toEqual({
      ok: false,
      reason: 'A step name can be at most 256 characters.',
    })
  })

  it('refuses a name and id that leave no identifier', () => {
    const result = insertStep(graph([], []), { first: true }, { id: '!!!', name: '!!!' })
    expect(result).toEqual({
      ok: false,
      reason: 'This step’s name needs at least one letter or digit.',
    })
  })

  it('produces a document the API accepts', () => {
    const module = (fn: string) =>
      `export default async function ${fn}({ env, event, inputs, step, ctx }) {\n  return 1;\n}\n`
    const base = graph([node('a', 'A'), node('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const ir: ArtifactIR = {
      ...base,
      nodes: base.nodes.map((n) => ({ ...n, data: { code: module(n.name) } })),
    }
    const next = insert(ir, { after: 'a' })
    expect(validateArtifact(next)).toEqual({ ok: true, value: next })
    expect(stepModuleProblems(next)).toEqual([])
  })
})
