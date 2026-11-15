import { describe, expect, it } from 'vitest'
import { validateArtifact, type ArtifactIR, type Edge, type WorkflowNode } from '@awaitstep/ir'
import { removalBlocker, removeNode } from '../graph-remove.js'
import { nodeReaders } from '../graph/readers.js'
import { stepModuleTemplate } from '../step-module.js'

function node(
  id: string,
  name: string,
  type = 'step',
  data: Record<string, unknown> = {},
  position = { x: 0, y: 0 },
): WorkflowNode {
  return { id, type, name, position, version: '1.0.0', provider: 'cloudflare', data }
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

function remove(ir: ArtifactIR, id: string) {
  const result = removeNode(ir, id)
  if (!result.ok) throw new Error(`expected a document, got: ${result.reason}`)
  return result
}

const chain = () =>
  graph(
    [node('a', 'Fetch user'), node('x', 'Say hello', 'custom:hello'), node('b', 'Notify')],
    [
      { id: 'e1', source: 'a', target: 'x' },
      { id: 'e2', source: 'x', target: 'b' },
    ],
  )

describe('removeNode — reconnecting', () => {
  it('connects A to B through the edge that led into the removed node, id kept', () => {
    const { ir } = remove(chain(), 'x')
    expect(ir.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(ir.edges).toEqual([{ id: 'e1', source: 'a', target: 'b' }])
    expect(validateArtifact(ir).ok).toBe(true)
  })

  it('leaves every other node where it was', () => {
    const ir = chain()
    ir.nodes[2] = { ...ir.nodes[2]!, position: { x: 600, y: 40 } }
    const next = remove(ir, 'x').ir
    expect(next.nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 600, y: 40 })
  })

  it('drops the connections into a last node', () => {
    const { ir, emptiedArms } = remove(chain(), 'b')
    expect(ir.edges).toEqual([{ id: 'e1', source: 'a', target: 'x' }])
    expect(emptiedArms).toEqual([])
  })

  it('makes the next node the entry when the entry goes', () => {
    const { ir } = remove(chain(), 'a')
    expect(ir.entryNodeId).toBe('x')
    expect(ir.edges).toEqual([{ id: 'e2', source: 'x', target: 'b' }])
  })

  it('keeps a container arm’s label on the reconnected edge', () => {
    const ir = graph(
      [node('loop', 'Each user', 'loop'), node('x', 'Load'), node('b', 'Mail'), node('c', 'Done')],
      [
        { id: 'body', source: 'loop', target: 'x', label: 'body' },
        { id: 'e2', source: 'x', target: 'b' },
        { id: 'then', source: 'loop', target: 'c', label: 'then' },
      ],
    )
    const next = remove(ir, 'x').ir
    expect(next.edges).toEqual([
      { id: 'body', source: 'loop', target: 'b', label: 'body' },
      { id: 'then', source: 'loop', target: 'c', label: 'then' },
    ])
  })

  it('reports an arm left empty by removing its only node', () => {
    const ir = graph(
      [node('br', 'Paid?', 'branch'), node('x', 'Charge'), node('y', 'Refund')],
      [
        { id: 'yes', source: 'br', target: 'x', label: 'yes' },
        { id: 'no', source: 'br', target: 'y', label: 'no' },
      ],
    )
    const result = remove(ir, 'x')
    expect(result.ir.edges).toEqual([{ id: 'no', source: 'br', target: 'y', label: 'no' }])
    expect(result.emptiedArms).toEqual([
      { containerId: 'br', containerName: 'Paid?', label: 'yes' },
    ])
  })

  it('retargets every connection into a join, dropping one that would duplicate', () => {
    const ir = graph(
      [
        node('br', 'Paid?', 'branch'),
        node('p', 'P'),
        node('q', 'Q'),
        node('j', 'Join'),
        node('s', 'S'),
      ],
      [
        { id: 'yes', source: 'br', target: 'p', label: 'yes' },
        { id: 'no', source: 'br', target: 'q', label: 'no' },
        { id: 'pj', source: 'p', target: 'j' },
        { id: 'qj', source: 'q', target: 'j' },
        { id: 'qs', source: 'q', target: 's' },
        { id: 'js', source: 'j', target: 's' },
      ],
    )
    const next = remove(ir, 'j').ir
    expect(next.edges).toEqual([
      { id: 'yes', source: 'br', target: 'p', label: 'yes' },
      { id: 'no', source: 'br', target: 'q', label: 'no' },
      { id: 'pj', source: 'p', target: 's' },
      { id: 'qs', source: 'q', target: 's' },
    ])
  })

  it('moves a wait’s arm selector to the node after the removed one', () => {
    const ir = graph(
      [
        node('w', 'Wait approval', 'wait_for_event', { onEventNode: 'x', onTimeoutNode: 't' }),
        node('x', 'Approved'),
        node('b', 'Ship'),
        node('t', 'Expired'),
      ],
      [
        { id: 'ev', source: 'w', target: 'x', label: 'onEvent' },
        { id: 'to', source: 'w', target: 't', label: 'onTimeout' },
        { id: 'xb', source: 'x', target: 'b' },
      ],
    )
    const next = remove(ir, 'x').ir
    expect(next.nodes.find((n) => n.id === 'w')?.data).toEqual({
      onEventNode: 'b',
      onTimeoutNode: 't',
    })
    const emptied = remove(ir, 't')
    expect(emptied.ir.nodes.find((n) => n.id === 'w')?.data.onTimeoutNode).toBe('')
    expect(emptied.emptiedArms).toEqual([
      { containerId: 'w', containerName: 'Wait approval', label: 'onTimeout' },
    ])
  })

  it('does not turn S → X → S into a loop on S', () => {
    const ir = graph(
      [node('a', 'A'), node('x', 'X'), node('s', 'S')],
      [
        { id: 'ax', source: 'a', target: 'x' },
        { id: 'xs', source: 'x', target: 's' },
        { id: 'sx', source: 's', target: 'x' },
      ],
    )
    expect(remove(ir, 'x').ir.edges).toEqual([{ id: 'ax', source: 'a', target: 's' }])
  })
})

describe('removeNode — refusals', () => {
  const containers = ['branch', 'parallel', 'try_catch', 'loop', 'race', 'wait_for_event']
  it.each(containers)('refuses a %s, whose arms need placing on the canvas', (type) => {
    const ir = graph(
      [node('a', 'A'), node('c', 'C', type)],
      [{ id: 'e', source: 'a', target: 'c' }],
    )
    expect(removeNode(ir, 'c')).toEqual({
      ok: false,
      reason: 'Remove it on the canvas — its arms need placing.',
    })
  })

  it('refuses a node that leads two ways', () => {
    const ir = graph(
      [node('a', 'A'), node('b', 'B'), node('c', 'C')],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'ac', source: 'a', target: 'c' },
      ],
    )
    expect(removalBlocker(ir, 'a')).toBe('Remove it on the canvas — its arms need placing.')
  })

  it('refuses the only node and an entry with nothing after it', () => {
    expect(removalBlocker(graph([node('a', 'A')], []), 'a')).toMatch(/at least one node/)
    const island = graph([node('a', 'A'), node('b', 'B')], [])
    expect(removalBlocker(island, 'a')).toMatch(/no start/)
  })

  it('refuses an id that is not in the version', () => {
    expect(removeNode(chain(), 'gone')).toEqual({
      ok: false,
      reason: 'That node is not in this version any more.',
    })
  })
})

describe('removeNode — names that shift', () => {
  it('reports the moved suffix and renames the step function to follow it', () => {
    const ir = graph(
      [
        node('s1', 'sample step', 'step', { code: stepModuleTemplate('sample_step') }),
        node('s2', 'sample step', 'step', { code: stepModuleTemplate('sample_step_2') }),
      ],
      [{ id: 'e', source: 's1', target: 's2' }],
    )
    const result = remove(ir, 's1')
    expect(result.renamed).toEqual([
      { nodeId: 's2', name: 'sample step', from: 'sample_step_2', to: 'sample_step' },
    ])
    expect(String(result.ir.nodes[0]!.data.code)).toContain('function sample_step(')
  })

  it('reports nothing when no name moves', () => {
    expect(remove(chain(), 'x').renamed).toEqual([])
  })
})

describe('nodeReaders', () => {
  const producer = node('p', 'say hello', 'custom:hello')

  it('finds {{…}} references by variable name and by id', () => {
    const ir = graph(
      [
        producer,
        node('n', 'Notify', 'custom:notify', {
          message: 'Hi {{say_hello.result}}',
          subject: '{{p.subject}}',
        }),
      ],
      [],
    )
    expect(nodeReaders(ir, 'p')).toEqual([
      {
        nodeId: 'n',
        nodeName: 'Notify',
        field: 'message',
        text: '{{say_hello.result}}',
        byName: true,
      },
      { nodeId: 'n', nodeName: 'Notify', field: 'subject', text: '{{p.subject}}', byName: false },
    ])
  })

  it('finds a step module’s inputs reads, member and destructured', () => {
    const member = `export default async function notify({ inputs }) {\n  return inputs.say_hello\n}\n`
    const destructured = `export default async function mail({ inputs }) {\n  const { say_hello } = inputs\n  return say_hello\n}\n`
    const ir = graph(
      [
        producer,
        node('a', 'Notify', 'step', { code: member }),
        node('b', 'Mail', 'step', { code: destructured }),
      ],
      [],
    )
    expect(nodeReaders(ir, 'p').map((r) => [r.nodeId, r.text])).toEqual([
      ['a', 'inputs.say_hello'],
      ['b', 'inputs.say_hello'],
    ])
  })

  it('finds bare names in inline steps and branch conditions', () => {
    const ir = graph(
      [
        producer,
        node('i', 'Inline', 'step', { inline: true, code: 'return say_hello.ok' }),
        node('br', 'Ok?', 'branch', {
          branches: [
            { label: 'yes', condition: 'say_hello.ok === true' },
            { label: 'no', condition: '' },
          ],
        }),
      ],
      [],
    )
    expect(nodeReaders(ir, 'p').map((r) => [r.nodeId, r.field])).toEqual([
      ['i', 'code'],
      ['br', 'branches[0].condition'],
    ])
  })

  it('does not count a string, comment, property or text field that merely contains the name', () => {
    const code = `export default async function x({ inputs }) {\n  // say_hello is not read\n  return { label: 'say_hello', v: inputs.other.say_hello }\n}\n`
    const ir = graph(
      [
        producer,
        node('s', 'X', 'step', { code }),
        node('i', 'Inline', 'step', { inline: true, code: 'return user.say_hello' }),
        node('n', 'Notify', 'custom:notify', { message: 'Then say_hello again' }),
      ],
      [],
    )
    expect(nodeReaders(ir, 'p')).toEqual([])
  })

  it('does not list a module that reads inputs whole', () => {
    const code = `export default async function x({ inputs }) {\n  return { ...inputs }\n}\n`
    const ir = graph([producer, node('s', 'X', 'step', { code })], [])
    expect(nodeReaders(ir, 'p')).toEqual([])
  })
})

describe('removeNode — arms that would run straight into a join', () => {
  const JOIN_ERROR = /leads straight into .*, which another path also reaches/

  function joinErrors(ir: ArtifactIR): string[] {
    const result = validateArtifact(ir)
    return result.ok ? [] : result.errors.map((error) => error.message)
  }

  it('removes the head of an arm whose next node the other arm also reaches, and the save takes it', () => {
    // Before: if { xx; jj } else { yy; jj }. After: if { jj } else { yy; jj }:
    // the generated code runs jj inside each arm, so validation accepts it.
    const gate = node('br', 'br', 'branch', {
      branches: [
        { label: 'a', condition: 'true' },
        { label: 'b', condition: '' },
      ],
    })
    const ir = graph(
      [gate, node('xx', 'xx'), node('yy', 'yy'), node('jj', 'jj')],
      [
        { id: 'a', source: 'br', target: 'xx', label: 'a' },
        { id: 'b', source: 'br', target: 'yy', label: 'b' },
        { id: 'xj', source: 'xx', target: 'jj' },
        { id: 'yj', source: 'yy', target: 'jj' },
      ],
    )
    expect(removalBlocker(ir, 'xx')).toBeNull()
    const after = remove(ir, 'xx').ir
    expect(after.edges).toContainEqual({ id: 'a', source: 'br', target: 'jj', label: 'a' })
    expect(joinErrors(after)).toEqual([])
  })

  it('refuses on save the head of an arm whose next node is the container’s way on', () => {
    const ir = graph(
      [node('br', 'br', 'branch'), node('xx', 'xx'), node('ss', 'ss')],
      [
        { id: 'a', source: 'br', target: 'xx', label: 'a' },
        { id: 'xs', source: 'xx', target: 'ss' },
        { id: 'then', source: 'br', target: 'ss', label: 'then' },
      ],
    )
    expect(joinErrors(remove(ir, 'xx').ir)).toContainEqual(expect.stringMatching(JOIN_ERROR))
  })

  it('takes the same shape on a wait’s arm, and refuses it on an unlabelled parallel arm', () => {
    const wait = graph(
      [node('w', 'w', 'wait_for_event'), node('xx', 'xx'), node('tt', 'tt'), node('jj', 'jj')],
      [
        { id: 'ev', source: 'w', target: 'xx', label: 'onEvent' },
        { id: 'to', source: 'w', target: 'tt', label: 'onTimeout' },
        { id: 'xj', source: 'xx', target: 'jj' },
        { id: 'tj', source: 'tt', target: 'jj' },
      ],
    )
    expect(joinErrors(remove(wait, 'xx').ir)).toEqual([])
    const fan = graph(
      [node('p', 'p', 'parallel'), node('xx', 'xx'), node('yy', 'yy'), node('jj', 'jj')],
      [
        { id: 'a', source: 'p', target: 'xx' },
        { id: 'b', source: 'p', target: 'yy' },
        { id: 'xj', source: 'xx', target: 'jj' },
        { id: 'yj', source: 'yy', target: 'jj' },
      ],
    )
    expect(joinErrors(remove(fan, 'xx').ir)).toContainEqual(
      expect.stringMatching(/p’s arm leads straight into jj/),
    )
  })

  it('still removes a node in the middle of an arm that leads into a join', () => {
    const ir = graph(
      [
        node('br', 'br', 'branch'),
        node('xx', 'xx'),
        node('mm', 'mm'),
        node('yy', 'yy'),
        node('jj', 'jj'),
      ],
      [
        { id: 'a', source: 'br', target: 'xx', label: 'a' },
        { id: 'b', source: 'br', target: 'yy', label: 'b' },
        { id: 'xm', source: 'xx', target: 'mm' },
        { id: 'mj', source: 'mm', target: 'jj' },
        { id: 'yj', source: 'yy', target: 'jj' },
      ],
    )
    expect(remove(ir, 'mm').ir.edges).toContainEqual({ id: 'xm', source: 'xx', target: 'jj' })
  })
})

describe('removeNode — which arms count as emptied', () => {
  it('does not call a container’s way on an emptied arm', () => {
    const ir = graph(
      [node('lp', 'lp', 'loop'), node('bb', 'bb'), node('tt', 'tt')],
      [
        { id: 'body', source: 'lp', target: 'bb', label: 'body' },
        { id: 'then', source: 'lp', target: 'tt', label: 'then' },
      ],
    )
    expect(remove(ir, 'tt').emptiedArms).toEqual([])
  })

  it('reports an emptied unlabelled parallel arm', () => {
    const ir = graph(
      [node('p', 'Fan', 'parallel'), node('xx', 'xx'), node('yy', 'yy')],
      [
        { id: 'a', source: 'p', target: 'xx' },
        { id: 'b', source: 'p', target: 'yy' },
      ],
    )
    expect(remove(ir, 'xx').emptiedArms).toEqual([
      { containerId: 'p', containerName: 'Fan', label: 'an arm' },
    ])
  })
})

describe('nodeReaders — by name or by id', () => {
  it('marks a read by variable name, and not one by id', () => {
    const ir = graph(
      [
        node('p', 'say hello', 'custom:hello'),
        node('n', 'Notify', 'custom:notify', { a: '{{say_hello.x}}', b: '{{p.x}}' }),
      ],
      [],
    )
    expect(nodeReaders(ir, 'p').map((r) => [r.text, r.byName])).toEqual([
      ['{{say_hello.x}}', true],
      ['{{p.x}}', false],
    ])
  })
})
