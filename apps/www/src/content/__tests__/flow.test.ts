import { describe, expect, it } from 'vitest'
import { workflowTemplates } from '@awaitstep/templates'
import { edgeLabel, FLOW_GAP, FLOW_NODE_W, layoutFlow, nodeDetail } from '../flow'

const names = new Map([['resend', 'Resend']])

describe('nodeDetail', () => {
  it('says which event a wait waits for', () => {
    expect(
      nodeDetail('wait_for_event', { eventType: 'payment-succeeded', timeout: '3 days' }, names),
    ).toBe('Waits for payment-succeeded')
  })

  it('names a registry integration, and a sleep by its duration', () => {
    expect(nodeDetail('resend', {}, names)).toBe('Resend')
    expect(nodeDetail('sleep', { duration: '1 day' }, names)).toBe('Sleeps 1 day')
  })
})

describe('edgeLabel', () => {
  const wait = { type: 'wait_for_event', data: { timeout: '2 hours' } }

  it('reads a wait’s paths as the event arriving or the time passing', () => {
    expect(edgeLabel('onEvent', wait)).toBe('Arrives')
    expect(edgeLabel('onTimeout', wait)).toBe('After 2 hours')
  })

  it('reads other labels as words, and keeps unlabelled edges bare', () => {
    expect(edgeLabel('not_activated', { type: 'branch', data: {} })).toBe('Not activated')
    expect(edgeLabel(undefined, { type: 'step', data: {} })).toBeUndefined()
  })
})

describe('layoutFlow', () => {
  const node = (id: string, type = 'step') => ({
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    data: {},
  })
  const edge = (source: string, target: string, label?: string) => ({
    id: `${source}-${target}`,
    source,
    target,
    ...(label ? { label } : {}),
  })

  it('puts each node on the row of its longest path, siblings side by side in edge order', () => {
    const layout = layoutFlow(
      {
        entryNodeId: 'a',
        nodes: [node('a'), node('b'), node('c'), node('d')],
        edges: [edge('a', 'b', 'left'), edge('a', 'c', 'right'), edge('b', 'd'), edge('c', 'd')],
      },
      names,
    )
    const at = Object.fromEntries(layout.nodes.map((n) => [n.id, [n.row, n.x]]))
    expect(at.a[0]).toBe(0)
    expect(at.b[0]).toBe(1)
    expect(at.c[0]).toBe(1)
    expect(at.b[1]).toBeLessThan(at.c[1])
    expect(at.d[0]).toBe(2)
    expect(layout.rows).toBe(3)
  })

  it('marks steps that use a registry integration', () => {
    const layout = layoutFlow({ entryNodeId: 'a', nodes: [node('a', 'resend')], edges: [] }, names)
    expect(layout.nodes[0]).toMatchObject({ integrationId: 'resend', detail: 'Resend' })
  })

  it('draws a try/catch’s way on below everything inside its arms, under the block', () => {
    const layout = layoutFlow(
      {
        entryNodeId: 'block',
        nodes: [
          node('block', 'try_catch'),
          node('first'),
          node('second'),
          node('undo'),
          node('after'),
        ],
        edges: [
          edge('block', 'first', 'try'),
          edge('first', 'second'),
          edge('block', 'undo', 'catch'),
          edge('block', 'after', 'then'),
        ],
      },
      names,
    )
    const at = new Map(layout.nodes.map((n) => [n.id, n]))
    expect(at.get('second')!.row).toBe(2)
    expect(at.get('after')!.row).toBe(3)
    expect(at.get('after')!.x).toBe(at.get('block')!.x)
    expect(at.get('second')!.x).toBe(at.get('first')!.x)
    expect(at.get('first')!.x).toBeLessThan(at.get('undo')!.x)
  })

  it('never lets two nodes in a row overlap, in any template, and fits them in the drawing', () => {
    for (const t of workflowTemplates) {
      const layout = layoutFlow(t.ir, names)
      for (let r = 0; r < layout.rows; r++) {
        const xs = layout.nodes
          .filter((n) => n.row === r)
          .map((n) => n.x)
          .sort((a, b) => a - b)
        for (let i = 1; i < xs.length; i++)
          expect(xs[i] - xs[i - 1], `${t.id} row ${r}`).toBeGreaterThanOrEqual(
            FLOW_NODE_W + FLOW_GAP - 1e-9,
          )
      }
      for (const n of layout.nodes) {
        expect(n.x - FLOW_NODE_W / 2, t.id).toBeGreaterThanOrEqual(0)
        expect(n.x + FLOW_NODE_W / 2, t.id).toBeLessThanOrEqual(layout.width)
      }
    }
  })
})
