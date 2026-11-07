import { describe, it, expect } from 'vitest'
import { validateNodeData } from '../validate.js'
import type { WorkflowNode } from '../types.js'

function makeNode(type: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id: 'n1',
    type,
    name: 'Node',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

describe('validateNodeData', () => {
  it('accepts well-formed builtin data', () => {
    expect(validateNodeData(makeNode('step', { code: 'return 1;', inline: false }))).toEqual([])
    expect(validateNodeData(makeNode('sleep', { duration: '10 seconds' }))).toEqual([])
    expect(validateNodeData(makeNode('sleep', { duration: 5000 }))).toEqual([])
  })

  it('accepts empty data — all fields are optional for legacy rows', () => {
    expect(validateNodeData(makeNode('step', {}))).toEqual([])
    expect(validateNodeData(makeNode('http_request', {}))).toEqual([])
  })

  it('accepts unknown extra keys (stored legacy strays like loop.maxIterations)', () => {
    const errors = validateNodeData(
      makeNode('loop', { loopType: 'times', count: 2, maxIterations: 2 }),
      { strict: true },
    )
    expect(errors).toEqual([])
  })

  it('reports wrong primitive types only in strict mode, with node-scoped paths', () => {
    const node = makeNode('step', { code: 123 })
    // Non-strict (the save/deploy gate) must accept legacy shapes.
    expect(validateNodeData(node)).toEqual([])
    const errors = validateNodeData(node, { strict: true })
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('nodes.n1.data.code')
    expect(errors[0].nodeId).toBe('n1')
  })

  it('never blocks legacy variance non-strictly (string count, partial branch arm)', () => {
    expect(validateNodeData(makeNode('loop', { loopType: 'times', count: '5' }))).toEqual([])
    expect(validateNodeData(makeNode('branch', { branches: [{ label: 'a' }] }))).toEqual([])
  })

  it('keeps the loop variant rules', () => {
    expect(validateNodeData(makeNode('loop', { loopType: 'sideways' }))[0].message).toContain(
      'must have loopType',
    )
    expect(validateNodeData(makeNode('loop', { loopType: 'forEach' }))[0].message).toContain(
      'requires a collection',
    )
    expect(
      validateNodeData(makeNode('loop', { loopType: 'times', count: 0 }))[0].message,
    ).toContain('count >= 1')
  })

  it('keeps the sub-workflow identity rules', () => {
    const errors = validateNodeData(makeNode('sub_workflow', {}))
    expect(errors.map((e) => e.path)).toEqual([
      'nodes.n1.data.workflowId',
      'nodes.n1.data.workflowName',
    ])
  })

  it('skips custom (non-builtin) node types entirely', () => {
    expect(validateNodeData(makeNode('google-gemini', { anything: 1 }))).toEqual([])
  })
})

describe('validateNodeData: a loop item name is a plain identifier', () => {
  it('accepts an identifier and refuses a pattern, a keyword and a name the step module already has', () => {
    const loop = (itemVar: unknown) =>
      validateNodeData(makeNode('loop', { loopType: 'forEach', collection: 'rows', itemVar }))
    expect(loop('row')).toEqual([])
    expect(loop(undefined)).toEqual([])
    for (const bad of ['(?:a+)+!', '[key, value]', 'class', 'inputs', 'index', 'a b', 42]) {
      const errors = loop(bad)
      expect(errors, String(bad)).toHaveLength(1)
      expect(errors[0]!.path).toBe('nodes.n1.data.itemVar')
      expect(errors[0]!.nodeId).toBe('n1')
    }
  })
})
