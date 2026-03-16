import { describe, it, expect } from 'vitest'
import { detectBindings } from '../../codegen/bindings.js'
import type { WorkflowIR } from '@awaitstep/ir'

function makeIR(nodes: WorkflowIR['nodes']): WorkflowIR {
  return {
    metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    entryNodeId: nodes[0]?.id ?? '',
  }
}

describe('detectBindings', () => {
  it('detects KV binding from step code', () => {
    const ir = makeIR([
      { id: 's1', name: 'S', position: { x: 0, y: 0 }, type: 'step', code: 'const val = await env.KV_CACHE.get("key")' },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toEqual({
      name: 'KV_CACHE',
      type: 'kv',
      source: 'code-scan',
      nodeId: 's1',
    })
  })

  it('detects D1 binding from step code', () => {
    const ir = makeIR([
      { id: 's1', name: 'S', position: { x: 0, y: 0 }, type: 'step', code: 'await env.DB_MAIN.prepare(sql)' },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('d1')
    expect(bindings[0]!.name).toBe('DB_MAIN')
  })

  it('detects R2 binding from step code', () => {
    const ir = makeIR([
      { id: 's1', name: 'S', position: { x: 0, y: 0 }, type: 'step', code: 'await env.BUCKET_ASSETS.put(key, data)' },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('r2')
  })

  it('includes explicit env bindings', () => {
    const ir = makeIR([])
    const bindings = detectBindings(ir, [{ name: 'MY_SECRET', type: 'secret' }])
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toEqual({ name: 'MY_SECRET', type: 'secret', source: 'env-binding' })
  })

  it('deduplicates bindings', () => {
    const ir = makeIR([
      { id: 's1', name: 'S1', position: { x: 0, y: 0 }, type: 'step', code: 'env.KV_CACHE.get("a")' },
      { id: 's2', name: 'S2', position: { x: 0, y: 100 }, type: 'step', code: 'env.KV_CACHE.put("b", "c")' },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
  })

  it('returns empty for no bindings', () => {
    const ir = makeIR([
      { id: 's1', name: 'S', position: { x: 0, y: 0 }, type: 'step', code: 'return 1' },
    ])
    expect(detectBindings(ir)).toEqual([])
  })
})
