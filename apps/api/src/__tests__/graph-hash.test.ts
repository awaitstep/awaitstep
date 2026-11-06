import { describe, it, expect } from 'vitest'
import { contentHash } from '@awaitstep/codegen'
import { canonicalJson, graphHash, graphOf } from '../lib/graph-hash.js'

const node = {
  id: 'step-1',
  type: 'step',
  name: 'Hello',
  position: { x: 0, y: 0 },
  version: '1.0.0',
  provider: 'cloudflare',
  data: { code: 'return 1;' },
}

const ir = {
  irVersion: 2,
  metadata: { name: 'test', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  nodes: [node],
  edges: [],
  entryNodeId: 'step-1',
  runtime: {
    env: [{ name: 'KEY' }],
    files: [{ path: 'lib/a.ts', source: 'export const a = 1' }],
    triggerCode: 'export default {}',
    dependencies: { zod: '^4' },
  },
}

const hashOf = (doc: unknown) => graphHash(JSON.stringify(doc))

describe('graphHash', () => {
  it('ignores key order, the irVersion stamp and the metadata the workflow row rewrites', () => {
    const reordered = {
      entryNodeId: ir.entryNodeId,
      edges: ir.edges,
      nodes: [
        {
          data: node.data,
          provider: node.provider,
          id: node.id,
          type: node.type,
          name: node.name,
          version: node.version,
          position: node.position,
        },
      ],
      runtime: ir.runtime,
    }
    expect(hashOf(reordered)).toBe(hashOf(ir))
    expect(hashOf({ ...ir, metadata: { ...ir.metadata, name: 'renamed', version: 7 } })).toBe(
      hashOf(ir),
    )
    expect(hashOf({ ...ir, irVersion: undefined })).toBe(hashOf(ir))
  })

  it('ignores the project-owned runtime: files, trigger code and dependencies', () => {
    const { files: _files, triggerCode: _tc, dependencies: _deps, ...env } = ir.runtime
    expect(hashOf({ ...ir, runtime: env })).toBe(hashOf(ir))
    expect(hashOf({ ...ir, runtime: { ...ir.runtime, files: [] } })).toBe(hashOf(ir))
    // A runtime with nothing else left reads as no runtime at all.
    const { runtime: _runtime, ...bare } = ir
    expect(hashOf({ ...bare, runtime: { files: ir.runtime.files } })).toBe(hashOf(bare))
  })

  it('moves with the graph: node code, settings, wiring, the trigger, the runtime env', () => {
    const base = hashOf(ir)
    expect(hashOf({ ...ir, nodes: [{ ...node, data: { code: 'return 2;' } }] })).not.toBe(base)
    expect(hashOf({ ...ir, nodes: [{ ...node, name: 'Renamed' }] })).not.toBe(base)
    expect(hashOf({ ...ir, edges: [{ id: 'e', source: 'step-1', target: 'step-1' }] })).not.toBe(
      base,
    )
    expect(hashOf({ ...ir, trigger: { type: 'http' } })).not.toBe(base)
    expect(hashOf({ ...ir, runtime: { ...ir.runtime, env: [] } })).not.toBe(base)
  })

  it('is the file ETag hash of the canonical graph', () => {
    const { metadata: _m, irVersion: _v, runtime: _r, ...graph } = ir
    expect(hashOf(ir)).toBe(
      contentHash(canonicalJson({ ...graph, runtime: { env: ir.runtime.env } })),
    )
  })

  it('reads a legacy document as its migrated self, so the first lazy save does not move it', () => {
    const { irVersion: _v, ...legacy } = ir
    expect(hashOf(legacy)).toBe(hashOf(ir))
    // A legacy script without a trigger migrates to the http trigger either way.
    const script = { ...legacy, kind: 'script' }
    expect(hashOf(script)).toBe(hashOf({ ...script, trigger: { type: 'http' } }))
  })

  it('is defined for every stored row, schema-invalid and unparseable ones included', () => {
    expect(graphHash('{"nodes":"not-a-list"}')).toMatch(/^[0-9a-f]{16}$/)
    expect(graphHash('{}')).toMatch(/^[0-9a-f]{16}$/)
    expect(graphHash('not json')).toBe(contentHash('not json'))
    expect(graphHash('[1,2]')).toBe(contentHash('[1,2]'))
  })
})

describe('canonicalJson', () => {
  it('keeps a key spelled __proto__ as data, so two documents differing in it hash apart', () => {
    const a = JSON.parse('{"nodes":[{"id":"n","data":{"__proto__":{"x":1}}}]}')
    const b = JSON.parse('{"nodes":[{"id":"n","data":{}}]}')
    expect(canonicalJson(a)).toContain('__proto__')
    expect(hashOf(a)).not.toBe(hashOf(b))
    expect(Object.keys(Object.prototype)).toEqual([])
  })
})

describe('graphOf', () => {
  it('leaves non-object documents and a non-object runtime as they are', () => {
    expect(graphOf(null)).toBeNull()
    expect(graphOf([1])).toEqual([1])
    expect(graphOf({ nodes: [], runtime: 'odd' })).toEqual({ nodes: [], runtime: 'odd' })
  })
})
