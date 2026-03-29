import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import {
  prepareContainerContext,
  indentCode,
  getForkTargets,
} from '../../../codegen/generators/container-utils.js'

const V = '1.0.0'
const P = 'cloudflare'

function node(id: string, type = 'step'): WorkflowNode {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: {},
  }
}

describe('prepareContainerContext', () => {
  it('builds adj, inDegree, nodeMap, and edgeLabels', () => {
    const ir: WorkflowIR = {
      metadata: { name: 't', version: 1, createdAt: '', updatedAt: '' },
      nodes: [node('a'), node('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b', label: 'body' }],
      entryNodeId: 'a',
    }
    const ctx = prepareContainerContext(ir)
    expect(ctx.adj.get('a')).toEqual(['b'])
    expect(ctx.inDegree.get('b')).toBe(1)
    expect(ctx.nodeMap.get('a')?.id).toBe('a')
    expect(ctx.edgeLabels.get('a')?.get('b')).toBe('body')
  })
})

describe('indentCode', () => {
  it('indents non-empty lines', () => {
    expect(indentCode('a\nb\nc', 2)).toBe('  a\n  b\n  c')
  })

  it('preserves empty lines', () => {
    expect(indentCode('a\n\nb', 4)).toBe('    a\n\n    b')
  })

  it('handles single line', () => {
    expect(indentCode('hello', 3)).toBe('   hello')
  })
})

describe('getForkTargets', () => {
  it('returns non-then targets', () => {
    const ir: WorkflowIR = {
      metadata: { name: 't', version: 1, createdAt: '', updatedAt: '' },
      nodes: [node('p', 'parallel'), node('a'), node('b'), node('c')],
      edges: [
        { id: 'e1', source: 'p', target: 'a' },
        { id: 'e2', source: 'p', target: 'b' },
        { id: 'e3', source: 'p', target: 'c', label: 'then' },
      ],
      entryNodeId: 'p',
    }
    const targets = getForkTargets('p', ir)
    expect(targets).toContain('a')
    expect(targets).toContain('b')
    expect(targets).not.toContain('c')
  })

  it('returns empty array when no edges', () => {
    const ir: WorkflowIR = {
      metadata: { name: 't', version: 1, createdAt: '', updatedAt: '' },
      nodes: [node('p', 'parallel')],
      edges: [],
      entryNodeId: 'p',
    }
    expect(getForkTargets('p', ir)).toEqual([])
  })
})
