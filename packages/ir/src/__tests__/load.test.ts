import { describe, it, expect } from 'vitest'
import { migrateArtifact } from '../migrate.js'
import { loadArtifact } from '../load.js'
import { serializeArtifact } from '../serialize.js'
import { IR_VERSION } from '../types.js'
import type { WorkflowIR } from '../types.js'
import simpleWorkflow from './fixtures/simple-workflow.json'
import branchingWorkflow from './fixtures/branching-workflow.json'

describe('migrateArtifact', () => {
  it('stamps irVersion on v1 documents without mutating the input', () => {
    const v1 = { ...(simpleWorkflow as Record<string, unknown>) }
    delete v1.irVersion
    const migrated = migrateArtifact(v1) as Record<string, unknown>
    expect(migrated.irVersion).toBe(IR_VERSION)
    expect(v1.irVersion).toBeUndefined()
    expect(migrated).not.toBe(v1)
  })

  it('returns already-current documents unchanged', () => {
    const v2 = { ...(simpleWorkflow as Record<string, unknown>), irVersion: IR_VERSION }
    expect(migrateArtifact(v2)).toBe(v2)
  })

  it('migrates legacy bindings to resources and drops the trigger block', () => {
    const legacy = {
      ...(simpleWorkflow as Record<string, unknown>),
      trigger: { type: 'cron', expression: '0 * * * *' },
      runtime: { bindings: [{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }] },
    }
    const migrated = migrateArtifact(legacy) as Record<string, unknown>
    expect(migrated.trigger).toBeUndefined()
    expect((migrated.runtime as { resources: unknown }).resources).toEqual([
      { name: 'KV_CACHE', kind: 'kv', resourceId: 'abc' },
    ])
  })

  it('merges existing resources with legacy bindings and keeps unknown fields', () => {
    const doc = {
      ...(simpleWorkflow as Record<string, unknown>),
      irVersion: 2,
      runtime: {
        resources: [{ name: 'BUCKET', kind: 'r2' }],
        bindings: [
          { name: 'CACHE', type: 'kv', description: 'keep' },
          { name: 'BUCKET', type: 'r2' },
        ],
      },
    }
    const migrated = migrateArtifact(doc) as {
      runtime: { resources: Record<string, unknown>[]; bindings?: unknown }
    }
    expect(migrated.runtime.bindings).toBeUndefined()
    expect(migrated.runtime.resources).toEqual([
      { name: 'BUCKET', kind: 'r2' },
      { name: 'CACHE', kind: 'kv', description: 'keep' },
    ])
  })

  it('fills the 365-day timeout on legacy wait nodes', () => {
    const doc = {
      ...(simpleWorkflow as Record<string, unknown>),
      irVersion: IR_VERSION,
      nodes: [
        {
          id: 'wait',
          type: 'wait_for_event',
          name: 'Wait',
          version: '1.0.0',
          data: { eventType: 'approval' },
        },
      ],
    }
    const migrated = migrateArtifact(doc) as {
      nodes: { data: { timeout?: string } }[]
    }
    expect(migrated.nodes[0]!.data.timeout).toBe('365 days')
  })

  it('strips an empty legacy bindings key from a current document', () => {
    const doc = {
      ...(simpleWorkflow as Record<string, unknown>),
      irVersion: IR_VERSION,
      runtime: { bindings: [] },
    }
    const migrated = migrateArtifact(doc) as { runtime: Record<string, unknown> }
    expect(migrated.runtime).toEqual({})
  })

  it('returns a validation error, not a throw, for null legacy entries', () => {
    const v2 = {
      ...(simpleWorkflow as Record<string, unknown>),
      runtime: { bindings: [null] },
    }
    const loaded = loadArtifact(v2)
    expect(loaded.ok).toBe(false)
    const v3 = {
      ...(simpleWorkflow as Record<string, unknown>),
      irVersion: IR_VERSION,
      runtime: { resources: [null] },
    }
    expect(loadArtifact(v3).ok).toBe(false)
  })

  it('passes non-object input through for the schema to reject', () => {
    expect(migrateArtifact(null)).toBe(null)
    expect(migrateArtifact('nope')).toBe('nope')
  })
})

describe('loadArtifact', () => {
  it('loads a v1 fixture and stamps the current version', () => {
    const result = loadArtifact(JSON.stringify(simpleWorkflow))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.irVersion).toBe(IR_VERSION)
      expect(result.value.nodes.length).toBeGreaterThan(0)
    }
  })

  it('accepts already-parsed objects', () => {
    const result = loadArtifact(branchingWorkflow)
    expect(result.ok).toBe(true)
  })

  it('round-trips through serializeArtifact', () => {
    const first = loadArtifact(simpleWorkflow)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = loadArtifact(serializeArtifact(first.value))
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.value).toEqual(first.value)
  })

  it('round-trips the runtime block', () => {
    const withRuntime = {
      ...(simpleWorkflow as Record<string, unknown>),
      runtime: {
        triggerCode: '@fetch function handler(request, env, ctx) { return new Response(null); }',
        dependencies: { zod: '^4.0.0' },
        env: [{ name: 'API_KEY', required: true, secret: true }],
        resources: [{ name: 'KV_CACHE', kind: 'kv', resourceId: 'abc123' }],
      },
    }
    const loaded = loadArtifact(withRuntime)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value.runtime?.resources?.[0]).toEqual({
      name: 'KV_CACHE',
      kind: 'kv',
      resourceId: 'abc123',
    })
    const again = loadArtifact(serializeArtifact(loaded.value))
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.value.runtime).toEqual(loaded.value.runtime)
  })

  it('reports malformed JSON as a single error', () => {
    const result = loadArtifact('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0].message).toContain('Invalid JSON')
    }
  })

  it('reports schema violations with paths', () => {
    const result = loadArtifact({ metadata: {}, nodes: [], edges: [], entryNodeId: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0)
  })

  it('does not run structural validation — drafts with unreachable nodes still load', () => {
    const base = simpleWorkflow as unknown as WorkflowIR
    const draft = {
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: 'orphan',
          type: 'step',
          name: 'Orphan',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 1;' },
        },
      ],
    }
    const result = loadArtifact(draft)
    expect(result.ok).toBe(true)
  })
})
