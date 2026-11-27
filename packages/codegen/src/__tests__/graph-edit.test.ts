import { describe, expect, it } from 'vitest'
import { validateArtifact, type ArtifactIR, type Edge, type WorkflowNode } from '@awaitstep/ir'
import { insertNode, insertStep, type NewStep, type StepPlacement } from '../graph-edit.js'
import { stepModuleProblems } from '../step-module.js'
import { createGenerationContext } from '../context.js'
import { generateWaitForEvent } from '../graph/generators/wait-for-event.js'

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
    irVersion: 3,
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
  `export default async function ${name}({ env, event, inputs, ctx }) {\n  // Write your business logic here\n\n  return { result: "ok" };\n}\n`

describe('insertStep — splicing into an edge', () => {
  it('gives each half the canvas side of the old edge’s end it still has', () => {
    const ir = graph(
      [node('a', 'Fetch user'), node('b', 'Send mail')],
      [{ id: 'e1', source: 'a', target: 'b', sourceSide: 'right', targetSide: 'top' }],
    )
    const next = insert(ir, { after: 'a' })
    expect(
      next.edges.map(({ source, target, sourceSide, targetSide }) => ({
        source,
        target,
        sourceSide,
        targetSide,
      })),
    ).toEqual([
      { source: 'a', target: NEW.id, sourceSide: 'right', targetSide: undefined },
      { source: NEW.id, target: 'b', sourceSide: undefined, targetSide: 'top' },
    ])
  })

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
    if (!result.ok) expect(result.reason).toMatch(/Choose which arm of Gate/)
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

  it('puts the step before the entry, in its place, and moves the graph a row down', () => {
    const ir = graph([node('a', 'A', 'step', { x: 280, y: 40 })], [], 'a')
    const next = insert(ir, { first: true })
    expect(next.edges.map((e) => [e.source, e.target])).toEqual([[NEW.id, 'a']])
    expect(next.entryNodeId).toBe(NEW.id)
    expect(next.nodes.find((n) => n.id === NEW.id)!.position).toEqual({ x: 280, y: 40 })
    expect(next.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 280, y: 160 })
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

  it('places the new step a row under its predecessor, as the canvas lays steps out', () => {
    const ir = graph([node('a', 'A', 'step', { x: 200, y: 80 })], [])
    const next = insert(ir, { after: 'a' })
    expect(next.nodes.find((n) => n.id === NEW.id)!.position).toEqual({ x: 200, y: 200 })
  })

  it('moves the path below a row down to make room, and leaves other paths where they are', () => {
    const ir = graph(
      [
        node('a', 'A', 'step', { x: 0, y: 0 }),
        node('b', 'B', 'step', { x: 0, y: 120 }),
        node('c', 'C', 'step', { x: 0, y: 240 }),
        node('side', 'Side', 'step', { x: 400, y: 240 }),
      ],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c' },
      ],
    )
    const next = insert(ir, { after: 'a' })
    const at = (id: string) => next.nodes.find((n) => n.id === id)!.position
    expect(at(NEW.id)).toEqual({ x: 0, y: 120 })
    expect(at('b')).toEqual({ x: 0, y: 240 })
    expect(at('c')).toEqual({ x: 0, y: 360 })
    expect(at('side')).toEqual({ x: 400, y: 240 })
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
      `export default async function ${fn}({ env, event, inputs, ctx }) {\n  return 1;\n}\n`
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

describe('insertNode — a custom or marketplace node', () => {
  const HELLO = {
    id: 'hello0000000',
    name: 'Say hello',
    type: 'custom:item_1',
    data: { greeting: '{{a.result}}' },
  }

  function placed(ir: ArtifactIR, placement: StepPlacement, next = HELLO) {
    const result = insertNode(ir, placement, next)
    if (!result.ok) throw new Error(`expected a document, got: ${result.reason}`)
    return result
  }

  it('splices it into X → Y with its fields and no code', () => {
    const ir = graph([node('a', 'A'), node('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const { ir: next, node: added } = placed(ir, { after: 'a' })
    expect(added).toMatchObject({
      id: HELLO.id,
      type: 'custom:item_1',
      name: 'Say hello',
      data: { greeting: '{{a.result}}' },
    })
    expect(added.data.code).toBeUndefined()
    expect(next.edges.map((e) => [e.source, e.target])).toEqual([
      ['a', HELLO.id],
      [HELLO.id, 'b'],
    ])
    expect(validateArtifact(next).ok).toBe(true)
  })

  it('goes onto a container arm, keeping the arm label', () => {
    const ir = graph(
      [node('loop', 'Loop', 'loop'), node('x', 'X')],
      [{ id: 'arm', source: 'loop', target: 'x', label: 'body' }],
    )
    const { ir: next } = placed(ir, { after: 'loop', edgeId: 'arm' })
    expect(next.edges[0]).toMatchObject({ source: 'loop', target: HELLO.id, label: 'body' })
    expect(next.edges[1]).toMatchObject({ source: HELLO.id, target: 'x' })
  })

  it('becomes the entry when placed first', () => {
    const ir = graph([node('a', 'A')], [])
    const { ir: next } = placed(ir, { first: true })
    expect(next.entryNodeId).toBe(HELLO.id)
    expect(next.edges).toEqual([{ id: `${HELLO.id}-out`, source: HELLO.id, target: 'a' }])
  })

  it('leaves every existing node’s name, position and data as it was', () => {
    const ir = graph([node('a', 'Say hello'), node('b', 'B')], [])
    const { ir: next } = placed(ir, { after: 'b' })
    expect(next.nodes.slice(0, 2)).toEqual(ir.nodes)
  })

  it('does not share the fields object it was given', () => {
    const ir = graph([node('a', 'A')], [])
    const data = { greeting: 'hi' }
    const { node: added } = placed(ir, { after: 'a' }, { ...HELLO, data })
    expect(added.data).toEqual(data)
    expect(added.data).not.toBe(data)
  })

  it('refuses a builtin other than step', () => {
    const ir = graph([node('a', 'A')], [])
    expect(insertNode(ir, { after: 'a' }, { ...HELLO, type: 'branch' })).toEqual({
      ok: false,
      reason: 'Only a step or a custom node can be added here.',
    })
    expect(insertNode(ir, { after: 'a' }, { ...HELLO, type: '' }).ok).toBe(false)
  })

  it('names the node, not a step, when it refuses', () => {
    const ir = graph([node('a', 'A')], [])
    expect(insertNode(ir, { after: 'a' }, { ...HELLO, name: '  ' })).toEqual({
      ok: false,
      reason: 'Give the node a name.',
    })
  })

  it('still scaffolds module code for a step, ignoring any fields given', () => {
    const ir = graph([node('a', 'A')], [])
    const result = insertNode(ir, { after: 'a' }, { ...HELLO, type: 'step' })
    if (!result.ok) throw new Error(result.reason)
    expect(result.node.data).toEqual({ code: TEMPLATE('Say_hello') })
  })
})

function wait(id: string, name: string, data: Record<string, unknown> = {}): WorkflowNode {
  return {
    ...node(id, name, 'wait_for_event'),
    data: { eventType: 'sunny', timeout: '30 seconds', ...data },
  }
}

describe('insertStep — a wait’s arms', () => {
  it('moves the onEvent field to a step spliced in front of its node', () => {
    const ir = graph(
      [wait('w', 'Wait'), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const next = insert(ir, { after: 'w', edgeId: 'e1' })
    expect(next.nodes.find((n) => n.id === 'w')?.data.onEventNode).toBe(NEW.id)
    expect(next.edges).toEqual([
      { id: `${NEW.id}-in`, source: 'w', target: NEW.id, label: 'onEvent' },
      { id: `${NEW.id}-out`, source: NEW.id, target: 's' },
    ])
  })

  it('keeps a step spliced into a selected onEvent arm in the generated code', () => {
    const ir = graph(
      [wait('w', 'Wait', { onEventNode: 's' }), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const next = insert(ir, { after: 'w', edgeId: 'e1' })
    const code = generateWaitForEvent(
      next.nodes.find((n) => n.id === 'w')!,
      next,
      createGenerationContext(next.nodes),
      (n) => `/* ${n.name} */`,
    )
    const onEvent = code.slice(code.indexOf('} else {'))
    expect(onEvent).toContain('$Charge_card(')
    expect(onEvent.indexOf('$Charge_card(')).toBeLessThan(onEvent.indexOf('$Sunny('))
  })

  it('moves a field that already named the arm’s node', () => {
    const ir = graph(
      [
        wait('w', 'Wait', { onEventNode: 's', onTimeoutNode: 'late' }),
        node('s', 'Sunny'),
        node('late', 'Late'),
      ],
      [
        { id: 'e1', source: 'w', target: 's', label: 'onEvent' },
        { id: 'e2', source: 'w', target: 'late', label: 'onTimeout' },
      ],
    )
    const next = insert(ir, { after: 'w', edgeId: 'e1' })
    expect(next.nodes.find((n) => n.id === 'w')?.data).toMatchObject({
      onEventNode: NEW.id,
      onTimeoutNode: 'late',
    })
  })

  it('starts the empty onTimeout arm, naming the step in its field', () => {
    const ir = graph(
      [wait('w', 'Wait', { onEventNode: 's' }), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const next = insert(ir, { after: 'w', arm: 'onTimeout' })
    expect(next.edges[1]).toEqual({
      id: `${NEW.id}-in`,
      source: 'w',
      target: NEW.id,
      label: 'onTimeout',
    })
    expect(next.nodes.find((n) => n.id === 'w')?.data).toMatchObject({
      onEventNode: 's',
      onTimeoutNode: NEW.id,
    })
  })

  it('refuses an arm that has a node', () => {
    const ir = graph(
      [wait('w', 'Wait'), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const filled = insertStep(ir, { after: 'w', arm: 'onEvent' }, NEW)
    expect(filled.ok).toBe(false)
    if (!filled.ok) expect(filled.reason).toBe('Wait’s “onEvent” arm is not empty any more.')
  })

  it('puts a step after the wait, once either arm is done', () => {
    const ir = graph(
      [wait('w', 'Wait'), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const next = insert(ir, { after: 'w', arm: 'then' })
    expect(next.edges.at(-1)).toMatchObject({ source: 'w', target: NEW.id, label: 'then' })
    expect(next.nodes.find((n) => n.id === 'w')?.data.onEventNode).toBeUndefined()
  })

  it('refuses a plain after on a wait: the arm must be named', () => {
    const ir = graph(
      [wait('w', 'Wait'), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const result = insertStep(ir, { after: 'w' }, NEW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('Choose which arm of Wait the new step goes in.')
  })
})

describe('insertStep — empty arms of every branching node', () => {
  it('starts a loop’s body, and the way on after it', () => {
    const ir = graph(
      [node('a', 'A'), node('loop', 'Loop', 'loop')],
      [{ id: 'e0', source: 'a', target: 'loop' }],
    )
    const body = insert(ir, { after: 'loop', arm: 'body' })
    expect(body.edges.at(-1)).toMatchObject({ source: 'loop', target: NEW.id, label: 'body' })
    const after = insert(ir, { after: 'loop', arm: 'then' })
    expect(after.edges.at(-1)).toMatchObject({ source: 'loop', target: NEW.id, label: 'then' })
  })

  it('starts a missing try/catch arm', () => {
    const ir = graph(
      [node('t', 'Guard', 'try_catch'), node('x', 'X')],
      [{ id: 'e1', source: 't', target: 'x', label: 'try' }],
    )
    const next = insert(ir, { after: 't', arm: 'catch' })
    expect(next.edges.at(-1)).toMatchObject({ source: 't', target: NEW.id, label: 'catch' })
    expect(insertStep(ir, { after: 't', arm: 'try' }, NEW).ok).toBe(false)
  })

  it('starts a branch condition with no connection, and refuses one it doesn’t have', () => {
    const gate = {
      ...node('g', 'Gate', 'branch'),
      data: {
        branches: [
          { label: 'yes', condition: 'a' },
          { label: 'no', condition: '' },
        ],
      },
    }
    const ir = graph([gate, node('y', 'Y')], [{ id: 'e1', source: 'g', target: 'y', label: 'yes' }])
    expect(insert(ir, { after: 'g', arm: 'no' }).edges.at(-1)).toMatchObject({
      label: 'no',
      target: NEW.id,
    })
    expect(insertStep(ir, { after: 'g', arm: 'maybe' }, NEW).ok).toBe(false)
  })

  it('adds an unlabelled arm to a parallel or race, however many it has', () => {
    for (const type of ['parallel', 'race']) {
      const ir = graph(
        [node('p', 'Fan', type), node('x', 'X'), node('y', 'Y')],
        [
          { id: 'e1', source: 'p', target: 'x' },
          { id: 'e2', source: 'p', target: 'y' },
        ],
      )
      const next = insert(ir, { after: 'p', arm: null })
      expect(next.edges.at(-1)).toEqual({ id: `${NEW.id}-in`, source: 'p', target: NEW.id })
    }
  })

  it('refuses a plain after on an empty container: it would make an edge the code ignores', () => {
    const ir = graph([node('loop', 'Loop', 'loop')], [])
    const result = insertStep(ir, { after: 'loop' }, NEW)
    expect(result.ok).toBe(false)
  })

  it('refuses an arm on a plain step', () => {
    const ir = graph([node('a', 'A')], [])
    const result = insertStep(ir, { after: 'a', arm: 'body' }, NEW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('A has no arms.')
  })
})

describe('insertStep — a wait arm its field overrides', () => {
  it('refuses a splice the generated code would skip', () => {
    const ir = graph(
      [wait('w', 'Wait', { onEventNode: 'other' }), node('s', 'Sunny'), node('other', 'Other')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const result = insertStep(ir, { after: 'w', edgeId: 'e1' }, NEW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('Wait’s “onEvent” arm runs another node. Change it on the canvas.')
    }
  })
})

describe('insertStep — an inline step', () => {
  it('keeps inline on a new step, and leaves it unset otherwise', () => {
    const ir = graph([node('a', 'A')], [])
    const inline = insertNode(ir, { after: 'a' }, { ...NEW, type: 'step', data: { inline: true } })
    if (!inline.ok) throw new Error(inline.reason)
    expect(inline.node.data).toMatchObject({ inline: true })
    // Statements, not a module, and no `return` that would end the whole run.
    expect(String(inline.node.data.code)).not.toContain('export default')
    expect(String(inline.node.data.code)).not.toContain('return')
    expect(stepModuleProblems(inline.ir).filter((p) => p.nodeId === NEW.id)).toEqual([])
    expect(insert(ir, { after: 'a' }).nodes.at(-1)!.data).not.toHaveProperty('inline')
  })
})

describe('insertStep — placed where the next step was, however the canvas spaced them', () => {
  it('takes the next step’s place, and moves it and what follows a row down', () => {
    // The canvas left New step only 90px under Say Hello.
    const ir = graph(
      [
        node('hello', 'Say Hello', 'step', { x: 0, y: 300 }),
        node('ns', 'New step', 'step', { x: 0, y: 390 }),
        node('an', 'another new', 'step', { x: 0, y: 700 }),
      ],
      [
        { id: 'h', source: 'hello', target: 'ns' },
        { id: 'n', source: 'ns', target: 'an' },
      ],
    )
    const next = insert(ir, { after: 'ns', edgeId: 'n' })
    const at = (id: string) => next.nodes.find((n) => n.id === id)!.position
    expect(at(NEW.id)).toEqual({ x: 0, y: 700 })
    expect(at('an')).toEqual({ x: 0, y: 820 })
    expect(at('ns')).toEqual({ x: 0, y: 390 })
    const spliced = insert(ir, { after: 'hello', edgeId: 'h' })
    const where = (id: string) => spliced.nodes.find((n) => n.id === id)!.position
    expect(where(NEW.id)).toEqual({ x: 0, y: 390 })
    expect(where('ns')).toEqual({ x: 0, y: 510 })
    expect(where('an')).toEqual({ x: 0, y: 820 })
  })
})

describe('insertStep — inside a block, what runs after the block makes room', () => {
  // Loop L, body B1 → B2, then N right under the body.
  const looped = () => {
    const loop = node('L', 'Each order', 'loop', { x: 0, y: 0 })
    loop.data = { loopType: 'forEach', collection: '[]' }
    return graph(
      [
        loop,
        node('b1', 'First', 'step', { x: 0, y: 120 }),
        node('b2', 'Second', 'step', { x: 0, y: 240 }),
        node('n', 'After loop', 'step', { x: 0, y: 360 }),
        node('m', 'Last', 'step', { x: 0, y: 480 }),
      ],
      [
        { id: 'body', source: 'L', target: 'b1', label: 'body' },
        { id: 'b12', source: 'b1', target: 'b2' },
        { id: 'then', source: 'L', target: 'n', label: 'then' },
        { id: 'nm', source: 'n', target: 'm' },
      ],
    )
  }
  const positions = (ir: ArtifactIR) =>
    Object.fromEntries(ir.nodes.map((n) => [n.id, n.position?.y]))

  it('moves the loop’s way on down when a step goes at the front of its body', () => {
    const next = insert(looped(), { after: 'L', edgeId: 'body' })
    expect(positions(next)).toEqual({ L: 0, b1: 240, b2: 360, n: 480, m: 600, [NEW.id]: 120 })
  })

  it('moves the loop’s way on down when a step goes at the end of its body', () => {
    const next = insert(looped(), { after: 'b2' })
    expect(positions(next)).toEqual({ L: 0, b1: 120, b2: 240, n: 480, m: 600, [NEW.id]: 360 })
  })

  it('leaves the loop’s way on alone when the step goes after the loop', () => {
    const next = insert(looped(), { after: 'L', edgeId: 'then' })
    expect(positions(next)).toEqual({ L: 0, b1: 120, b2: 240, n: 480, m: 600, [NEW.id]: 360 })
  })

  it('leaves a block before the step alone', () => {
    const next = insert(looped(), { after: 'n', edgeId: 'nm' })
    expect(positions(next)).toEqual({ L: 0, b1: 120, b2: 240, n: 360, m: 600, [NEW.id]: 480 })
  })
})
