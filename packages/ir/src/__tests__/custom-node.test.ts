import { describe, it, expect } from 'vitest'
import { workflowNodeSchema, workflowIRSchema } from '../schema.js'
import { serializeIR, deserializeIR } from '../serialize.js'
import type { WorkflowNode, WorkflowIR } from '../types.js'

const validNode: WorkflowNode = {
  id: 'node-1',
  type: 'stripe-charge',
  name: 'Stripe Charge',
  position: { x: 0, y: 0 },
  version: '1.0.0',
  provider: 'cloudflare',
  data: { amount: 5000, currency: 'usd' },
}

describe('WorkflowNode schema', () => {
  it('accepts a valid node', () => {
    const result = workflowNodeSchema.safeParse(validNode)
    expect(result.success).toBe(true)
  })

  it('accepts a node with step config', () => {
    const node = {
      ...validNode,
      config: {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' as const },
        timeout: '30 seconds',
      },
    }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(true)
  })

  it('accepts a node with empty data', () => {
    const node = { ...validNode, data: {} }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(true)
  })

  it('accepts any string as type', () => {
    for (const type of ['step', 'sleep', 'stripe-charge', 'custom-node']) {
      const node = { ...validNode, type }
      const result = workflowNodeSchema.safeParse(node)
      expect(result.success).toBe(true)
    }
  })

  it('rejects empty type', () => {
    const node = { ...validNode, type: '' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects empty version', () => {
    const node = { ...validNode, version: '' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects empty provider', () => {
    const node = { ...validNode, provider: '' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects missing data', () => {
    const { data: _, ...node } = validNode
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects missing version', () => {
    const { version: _, ...node } = validNode
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })
})

describe('WorkflowIR with unified nodes', () => {
  const ir: WorkflowIR = {
    metadata: {
      name: 'test-workflow',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes: [validNode],
    edges: [],
    entryNodeId: 'node-1',
  }

  it('validates a workflow', () => {
    const result = workflowIRSchema.safeParse(ir)
    expect(result.success).toBe(true)
  })

  it('round-trips through serialize/deserialize', () => {
    const json = serializeIR(ir)
    const restored = deserializeIR(json)
    expect(restored).toEqual(ir)
  })

  it('validates a workflow mixing built-in and registry nodes', () => {
    const mixedIR: WorkflowIR = {
      ...ir,
      nodes: [
        {
          id: 'step-1',
          type: 'step',
          name: 'Fetch data',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return { ok: true };' },
        },
        { ...validNode, id: 'custom-1' },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'custom-1' }],
      entryNodeId: 'step-1',
    }
    const result = workflowIRSchema.safeParse(mixedIR)
    expect(result.success).toBe(true)
  })
})
