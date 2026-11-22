import { describe, expect, it } from 'vitest'
import ir from '../fixtures/refund-review.ir.json' with { type: 'json' }
import { nodeDetail, REFUND_REVIEW, sceneGraphFromIr } from '../graph.js'

describe('REFUND_REVIEW', () => {
  it('keeps every node and edge of the refund-review IR', () => {
    expect(REFUND_REVIEW.nodes.map((n) => n.id).sort()).toEqual(ir.nodes.map((n) => n.id).sort())
    expect(REFUND_REVIEW.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(
      ir.edges.map((e) => `${e.source}>${e.target}`).sort(),
    )
  })

  it('shows the failure the refund step throws', () => {
    expect(REFUND_REVIEW.nodes.find((n) => n.id === 'issue_refund')?.failure).toBe('Stripe 503')
  })
})

describe('sceneGraphFromIr', () => {
  const tiny = {
    metadata: { name: 'tiny' },
    nodes: [{ id: 'a', type: 'sleep', name: 'Nap', data: { duration: '1 hour' } }],
    edges: [],
  }

  it('places nodes from the layout and keeps their detail', () => {
    const g = sceneGraphFromIr(tiny, { a: { row: 0, lane: 0 } })
    expect(g.nodes[0]).toMatchObject({ id: 'a', kind: 'sleep', detail: '1 hour', row: 0, lane: 0 })
  })

  it('refuses a node without a place or of a kind it cannot draw', () => {
    expect(() => sceneGraphFromIr(tiny, {})).toThrow(/no layout/)
    const odd = { ...tiny, nodes: [{ id: 'a', type: 'custom', name: 'X' }] }
    expect(() => sceneGraphFromIr(odd, { a: { row: 0, lane: 0 } })).toThrow(/undrawn kind/)
  })
})

describe('nodeDetail', () => {
  it('prints the line the dashboard canvas prints', () => {
    expect(nodeDetail('http_request', { method: 'POST', url: 'https://api.example.com/x' })).toBe(
      'POST api.example.com/x',
    )
    expect(nodeDetail('wait_for_event', { eventType: 'approved', timeout: '3 days' })).toBe(
      'approved (3 days)',
    )
    expect(nodeDetail('step', {})).toBeUndefined()
  })
})
