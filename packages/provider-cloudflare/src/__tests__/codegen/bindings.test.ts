import { describe, it, expect } from 'vitest'
import { detectBindings, deriveQueueName } from '../../codegen/bindings.js'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'

describe('deriveQueueName', () => {
  it('strips QUEUE_ prefix and lowercases', () => {
    expect(deriveQueueName('QUEUE_EMAILS')).toBe('emails')
    expect(deriveQueueName('QUEUE_JOBS_HIGH')).toBe('jobs_high')
  })

  it('handles bare QUEUE binding by lowercasing the original', () => {
    expect(deriveQueueName('QUEUE')).toBe('queue')
  })

  it('is case-insensitive on the prefix', () => {
    expect(deriveQueueName('queue_emails')).toBe('emails')
    expect(deriveQueueName('Queue_emails')).toBe('emails')
  })

  it('passes non-QUEUE bindings through (lowercased)', () => {
    // Defensive: shouldn't be called with non-queue bindings, but if so,
    // returns a sensible value rather than throwing.
    expect(deriveQueueName('FOO_BAR')).toBe('foo_bar')
  })
})

const V = '1.0.0'
const P = 'cloudflare'

function makeIR(nodes: WorkflowNode[]): WorkflowIR {
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
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'const val = await env.KV_CACHE.get("key")' },
      },
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
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'await env.DB_MAIN.prepare(sql)' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('d1')
    expect(bindings[0]!.name).toBe('DB_MAIN')
  })

  it('detects R2 binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'await env.BUCKET_ASSETS.put(key, data)' },
      },
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
      {
        id: 's1',
        name: 'S1',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'env.KV_CACHE.get("a")' },
      },
      {
        id: 's2',
        name: 'S2',
        position: { x: 0, y: 100 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'env.KV_CACHE.put("b", "c")' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
  })

  it('detects Queue binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'await env.QUEUE_NOTIFICATIONS.send({ type: "email" })' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('queue')
    expect(bindings[0]!.name).toBe('QUEUE_NOTIFICATIONS')
  })

  it('detects multiple binding types from a single node', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: {
          code: 'const v = await env.KV_CACHE.get("k"); await env.DB_MAIN.prepare(sql); await env.QUEUE_JOBS.send(v)',
        },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(3)
    const types = bindings.map((b) => b.type).sort()
    expect(types).toEqual(['d1', 'kv', 'queue'])
  })

  it('detects bindings without underscore suffix', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: {
          code: 'env.KV.get("key"); env.DB.prepare(sql); env.BUCKET.put(k, v); env.QUEUE.send(m)',
        },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(4)
    expect(bindings.map((b) => b.name).sort()).toEqual(['BUCKET', 'DB', 'KV', 'QUEUE'])
  })

  it('detects AI binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: {
          code: 'const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt })',
        },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('ai')
    expect(bindings[0]!.name).toBe('AI')
  })

  it('detects AI binding with suffix', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'await env.AI_CHAT.run(model, input)' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.name).toBe('AI_CHAT')
  })

  it('does not false-positive on AI-prefixed non-binding names', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'const x = env.AIRFLOW_URL' },
      },
    ])
    const bindings = detectBindings(ir)
    const aiBindings = bindings.filter((b) => b.type === 'ai')
    expect(aiBindings).toHaveLength(0)
  })

  it('detects Vectorize binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'await env.VECTORIZE_INDEX.query(vector, { topK: 5 })' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('vectorize')
    expect(bindings[0]!.name).toBe('VECTORIZE_INDEX')
  })

  it('detects Analytics Engine binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'env.ANALYTICS_EVENTS.writeDataPoint({ blobs: ["signup"] })' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('analytics_engine')
    expect(bindings[0]!.name).toBe('ANALYTICS_EVENTS')
  })

  it('detects Hyperdrive binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'const connStr = env.HYPERDRIVE_PG.connectionString' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('hyperdrive')
    expect(bindings[0]!.name).toBe('HYPERDRIVE_PG')
  })

  it('detects Browser binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'const browser = await env.BROWSER.fetch(url)' },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('browser')
    expect(bindings[0]!.name).toBe('BROWSER')
  })

  it('detects Service binding from step code', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: {
          code: 'const resp = await env.SERVICE_AUTH.fetch(new Request("https://fake/login"))',
        },
      },
    ])
    const bindings = detectBindings(ir)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]!.type).toBe('service')
    expect(bindings[0]!.name).toBe('SERVICE_AUTH')
  })

  it('returns empty for no bindings', () => {
    const ir = makeIR([
      {
        id: 's1',
        name: 'S',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'return 1' },
      },
    ])
    expect(detectBindings(ir)).toEqual([])
  })
})
