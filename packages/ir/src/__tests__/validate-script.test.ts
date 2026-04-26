import { describe, it, expect } from 'vitest'
import { validateScript, validateArtifact } from '../validate.js'
import type { ScriptIR } from '../types.js'

function node(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'step',
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: 'return event.payload;' },
    ...overrides,
  }
}

function makeScript(nodes: ReturnType<typeof node>[], entryNodeId?: string): ScriptIR {
  return {
    kind: 'script',
    metadata: {
      name: 'test-script',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes,
    edges: [],
    entryNodeId: entryNodeId ?? nodes[0]!.id,
    trigger: { type: 'http' },
  }
}

describe('validateScript', () => {
  it('accepts a single-step transform script', () => {
    const result = validateScript(makeScript([node('transform')]))
    expect(result.ok).toBe(true)
  })

  it('rejects a script that is missing its kind discriminator', () => {
    const result = validateScript({ ...makeScript([node('transform')]), kind: undefined })
    expect(result.ok).toBe(false)
  })

  it('rejects a script that omits its http trigger', () => {
    const ir = makeScript([node('transform')]) as Partial<ScriptIR>
    delete ir.trigger
    const result = validateScript(ir)
    expect(result.ok).toBe(false)
  })

  it.each(['wait_for_event', 'sleep', 'sleep_until'])(
    'rejects a script containing a %s node (durable runtime required)',
    (incompatibleType) => {
      const ir = makeScript([node('blocker', { type: incompatibleType, data: {} })])
      const result = validateScript(ir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.some((e) => e.message.includes('durable runtime'))).toBe(true)
      }
    },
  )
})

describe('validateArtifact', () => {
  it('dispatches to the script validator when kind is "script"', () => {
    const ir = makeScript([node('blocker', { type: 'sleep', data: {} })])
    const result = validateArtifact(ir)
    expect(result.ok).toBe(false)
  })

  it('treats absent kind as a workflow (legacy IRs)', () => {
    const result = validateArtifact({
      metadata: {
        name: 'legacy',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [node('first')],
      edges: [],
      entryNodeId: 'first',
    })
    expect(result.ok).toBe(true)
  })

  it('accepts a workflow with explicit kind', () => {
    const result = validateArtifact({
      kind: 'workflow',
      metadata: {
        name: 'explicit',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [node('first')],
      edges: [],
      entryNodeId: 'first',
    })
    expect(result.ok).toBe(true)
  })
})
