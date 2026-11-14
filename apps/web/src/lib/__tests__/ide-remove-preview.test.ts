import { describe, expect, it } from 'vitest'
import type { Edge, WorkflowNode } from '@awaitstep/ir'
import { removePreview } from '../ide/remove-preview'

function node(
  id: string,
  name: string,
  type = 'step',
  data: Record<string, unknown> = {},
): WorkflowNode {
  return { id, type, name, version: '1.0.0', provider: 'cloudflare', data }
}

const nodes = [node('a', 'load'), node('b', 'notify', 'custom:n', { m: '{{load.x}}' })]
const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b' }]
const graph = { nodes, edges, entryNodeId: 'a' }

describe('removePreview', () => {
  it('lists readers and no draft when the step has none', () => {
    const preview = removePreview(graph, 'a', {})
    expect(preview).toMatchObject({
      status: 'ok',
      name: 'load',
      readers: [{ nodeId: 'b', field: 'm', text: '{{load.x}}' }],
      draftPath: null,
    })
  })

  it('names the step’s draft, and never a custom node’s', () => {
    expect(removePreview(graph, 'a', { 'steps/a.ts': {} })).toMatchObject({
      draftPath: 'steps/a.ts',
    })
    const lastIsCustom = { nodes, edges, entryNodeId: 'a' }
    expect(removePreview(lastIsCustom, 'b', { 'steps/b.ts': {} })).toMatchObject({
      draftPath: null,
    })
  })

  it('says why a node is blocked, and when it is gone', () => {
    expect(removePreview({ nodes: [nodes[0]!], edges: [], entryNodeId: 'a' }, 'a', {})).toEqual({
      status: 'blocked',
      name: 'load',
      reason: 'A workflow needs at least one node. Add another first.',
    })
    expect(removePreview(graph, 'zz', {})).toEqual({ status: 'missing' })
  })

  it('says which name reads move to the node that takes the name over, without an error', () => {
    const twins = {
      nodes: [
        node('s1', 'sample step'),
        node('s2', 'sample step'),
        node('n', 'notify', 'custom:n', { a: '{{sample_step.x}}', b: '{{s1.x}}' }),
      ],
      edges: [
        { id: 'e1', source: 's1', target: 's2' },
        { id: 'e2', source: 's2', target: 'n' },
      ],
      entryNodeId: 's1',
    }
    const preview = removePreview(twins, 's1', { 'steps/s2.ts': {} })
    if (preview.status !== 'ok') throw new Error(preview.status)
    expect(preview.rebound).toEqual({
      toName: 'sample step',
      readers: [expect.objectContaining({ text: '{{sample_step.x}}' })],
    })
    // A read by id has no node to move to: it breaks.
    expect(preview.readers).toEqual([expect.objectContaining({ text: '{{s1.x}}' })])
    expect(preview.renamed).toEqual([
      expect.objectContaining({ nodeId: 's2', to: 'sample_step', draftPath: 'steps/s2.ts' }),
    ])
  })

  it('has nothing re-bound when no name moves', () => {
    const preview = removePreview(graph, 'a', {})
    expect(preview).toMatchObject({ rebound: null })
  })
})
