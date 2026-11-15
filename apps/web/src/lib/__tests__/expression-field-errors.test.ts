import { describe, expect, it } from 'vitest'
import { fieldExpressionErrors, scopeForNewNode } from '../expressions/field-errors'

const scope = {
  nodeId: 'me',
  upstream: new Set(['a']),
  allNodeIds: new Set(['a', 'me']),
}

describe('fieldExpressionErrors', () => {
  it('keys each field’s first problem, including fields named like Object’s own', () => {
    const errors = fieldExpressionErrors({ constructor: '{{}}', title: '{{}} {{nope.x}}' }, scope)
    expect(Object.keys(errors)).toEqual(['constructor', 'title'])
    expect(errors.constructor).toMatch(/isn’t a valid expression/)
  })

  it('reads a built-in node’s code fields as code', () => {
    expect(fieldExpressionErrors({ body: 'f({{}})' }, scope, undefined, 'http_request')).toEqual({})
  })
})

describe('scopeForNewNode', () => {
  const nodes = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ]
  const edges = [{ id: 'e1', source: 'a', target: 'b' }]

  it('lets a node placed after A read A but not B', () => {
    const placed = scopeForNewNode(
      { nodes, edges, entryNodeId: 'a' },
      { after: 'a', edgeId: 'e1' },
      { id: 'new', name: 'New', type: 'step' },
    )
    expect(placed.upstream.has('a')).toBe(true)
    expect(placed.upstream.has('b')).toBe(false)
  })

  it('judges no refs when the place can’t take the node', () => {
    const nowhere = scopeForNewNode(
      { nodes, edges, entryNodeId: 'a' },
      { after: 'gone' },
      { id: 'new', name: 'New', type: 'step' },
    )
    expect(nowhere.upstream.has('anything')).toBe(true)
  })
})
