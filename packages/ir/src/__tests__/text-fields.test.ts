import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '../types.js'
import { containsExpressions, findExpressions, nodeExpressionProblems } from '../expressions.js'

function node(type: string, data: Record<string, unknown>): WorkflowNode {
  return { id: 'n', type, name: 'n', position: { x: 0, y: 0 }, version: '1.0.0', data }
}

const scope = {
  nodeId: 'n',
  upstream: new Set(['load']),
  allNodeIds: new Set(['load', 'n']),
  idByName: new Map([['load', 'load']]),
}

describe('built-in text maps on the expression surface', () => {
  it('finds an expression that sits only in an HTTP header or query value', () => {
    const headersOnly = node('http_request', {
      url: 'https://x',
      headers: { Authorization: 'Bearer {{load.token}}' },
    })
    expect(containsExpressions(headersOnly)).toBe(true)
    expect(findExpressions(headersOnly)).toMatchObject([
      { raw: '{{load.token}}', dataKey: 'headers', objectKey: 'Authorization' },
    ])
    expect(
      containsExpressions(
        node('http_request', { url: 'https://x', queryParams: { id: '{{load.id}}' } }),
      ),
    ).toBe(true)
    expect(
      containsExpressions(node('sub_script', { url: 'https://x', headers: { id: '{{load.id}}' } })),
    ).toBe(true)
  })

  it('reports a bad reference in a header value', () => {
    const problems = nodeExpressionProblems(
      { url: 'https://x', headers: { Authorization: 'Bearer {{lod.token}}' } },
      scope,
      undefined,
      'http_request',
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ field: 'headers' })
  })

  it('leaves a nested object of any other node type alone, as codegen does', () => {
    const custom = node('custom:abc', { options: { a: '{{load.id}}' } })
    expect(containsExpressions(custom)).toBe(false)
    expect(
      nodeExpressionProblems({ options: { a: '{{lod.id}}' } }, scope, undefined, 'custom:abc'),
    ).toEqual([])
    expect(nodeExpressionProblems({ headers: { a: '{{lod.id}}' } }, scope)).toEqual([])
  })
})
