import { describe, expect, it } from 'vitest'
import { connectionFits, exitConnection } from '../connection-rules'

const node = (type: string, data: Record<string, unknown> = {}) => ({ type, data }) as never

describe('exitConnection', () => {
  it('lets a step have one way out', () => {
    expect(exitConnection(node('step'), [])).toEqual({ allowed: true })
    expect(exitConnection(node('step'), [{}])).toEqual({ allowed: false })
  })

  it('treats a custom node like a step', () => {
    expect(exitConnection(node('custom:say-hello'), [{}])).toEqual({ allowed: false })
  })

  it('hands a loop its body, then its continuation, then nothing', () => {
    expect(exitConnection(node('loop'), [])).toEqual({ allowed: true, label: 'body' })
    expect(exitConnection(node('loop'), [{ label: 'body' }])).toEqual({
      allowed: true,
      label: 'then',
    })
    expect(exitConnection(node('loop'), [{ label: 'body' }, { label: 'then' }])).toEqual({
      allowed: false,
    })
  })

  it('hands a try/catch its blocks in order', () => {
    const labels = ['try', 'catch', 'finally', 'then']
    labels.forEach((label, i) => {
      const outgoing = labels.slice(0, i).map((l) => ({ label: l }))
      expect(exitConnection(node('try_catch'), outgoing)).toEqual({ allowed: true, label })
    })
    expect(
      exitConnection(
        node('try_catch'),
        labels.map((l) => ({ label: l })),
      ),
    ).toEqual({ allowed: false })
  })

  it('gives a branch only its continuation; its arms are wired in the panel', () => {
    expect(exitConnection(node('branch'), [{ label: 'true' }])).toEqual({
      allowed: true,
      label: 'then',
    })
    expect(exitConnection(node('branch'), [{ label: 'then' }])).toEqual({ allowed: false })
  })

  it('lets parallel and race fan out without labels', () => {
    expect(exitConnection(node('parallel'), [{}, {}])).toEqual({ allowed: true })
    expect(exitConnection(node('race'), [{}])).toEqual({ allowed: true })
  })

  // Regression: break is not a multi-edge type, and onConnect read its
  // never-filled outgoing list, so a drag from a break threw.
  it('lets a break have one way out, labelled else when it has a condition', () => {
    expect(exitConnection(node('break'), [])).toEqual({ allowed: true })
    expect(exitConnection(node('break', { condition: 'x > 1' }), [])).toEqual({
      allowed: true,
      label: 'else',
    })
    expect(exitConnection(node('break', { condition: 'x > 1' }), [{ label: 'else' }])).toEqual({
      allowed: false,
    })
  })
})

describe('connectionFits', () => {
  const flowNode = (id: string, type = 'step') =>
    ({
      id,
      data: { irNode: { id, type, data: {} } },
    }) as never

  it('lets a step with its one way out be dragged again onto the node it joins', () => {
    const nodes = [flowNode('a'), flowNode('b'), flowNode('c')]
    const edges = [{ source: 'a', target: 'b' }]
    expect(connectionFits(nodes, edges, { source: 'a', target: 'b' })).toBe(true)
    expect(connectionFits(nodes, edges, { source: 'a', target: 'c' })).toBe(false)
  })

  it('lets a step with no way out connect', () => {
    expect(connectionFits([flowNode('a'), flowNode('b')], [], { source: 'a', target: 'b' })).toBe(
      true,
    )
  })
})
