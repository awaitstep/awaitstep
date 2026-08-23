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

  it('defaults the trigger for legacy script IRs so they still load', () => {
    const legacyScript = {
      ...(simpleWorkflow as Record<string, unknown>),
      kind: 'script',
    }
    delete (legacyScript as Record<string, unknown>).trigger
    const migrated = migrateArtifact(legacyScript) as Record<string, unknown>
    expect(migrated.trigger).toEqual({ type: 'http' })

    const loaded = loadArtifact(legacyScript)
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.value.kind).toBe('script')
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
