import { describe, it, expect } from 'vitest'
import { workflowNodeSchema, workflowIRSchema } from '../schema.js'
import { serializeIR, deserializeIR } from '../serialize.js'
import type { CustomNode, WorkflowIR } from '../types.js'

const validCustomNode: CustomNode = {
  id: 'node-1',
  type: 'custom',
  name: 'Stripe Charge',
  position: { x: 0, y: 0 },
  nodeId: 'stripe-charge',
  version: '1.0.0',
  provider: 'cloudflare',
  data: { amount: 5000, currency: 'usd' },
}

describe('CustomNode schema', () => {
  it('accepts a valid custom node', () => {
    const result = workflowNodeSchema.safeParse(validCustomNode)
    expect(result.success).toBe(true)
  })

  it('accepts a custom node with step config', () => {
    const node = {
      ...validCustomNode,
      config: {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' as const },
        timeout: '30 seconds',
      },
    }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(true)
  })

  it('accepts a custom node with empty data', () => {
    const node = { ...validCustomNode, data: {} }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(true)
  })

  it('rejects nodeId with uppercase letters', () => {
    const node = { ...validCustomNode, nodeId: 'Stripe-Charge' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects nodeId with underscores', () => {
    const node = { ...validCustomNode, nodeId: 'stripe_charge' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects empty nodeId', () => {
    const node = { ...validCustomNode, nodeId: '' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects empty version', () => {
    const node = { ...validCustomNode, version: '' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects empty provider', () => {
    const node = { ...validCustomNode, provider: '' }
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects missing nodeId', () => {
    const { nodeId: _, ...node } = validCustomNode
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })

  it('rejects missing data', () => {
    const { data: _, ...node } = validCustomNode
    const result = workflowNodeSchema.safeParse(node)
    expect(result.success).toBe(false)
  })
})

describe('CustomNode in WorkflowIR', () => {
  const irWithCustomNode: WorkflowIR = {
    metadata: {
      name: 'test-workflow',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes: [validCustomNode],
    edges: [],
    entryNodeId: 'node-1',
  }

  it('validates a workflow containing a custom node', () => {
    const result = workflowIRSchema.safeParse(irWithCustomNode)
    expect(result.success).toBe(true)
  })

  it('round-trips a workflow with custom nodes through serialize/deserialize', () => {
    const json = serializeIR(irWithCustomNode)
    const restored = deserializeIR(json)
    expect(restored).toEqual(irWithCustomNode)
  })

  it('validates a workflow mixing built-in and custom nodes', () => {
    const mixedIR: WorkflowIR = {
      ...irWithCustomNode,
      nodes: [
        {
          id: 'step-1',
          type: 'step',
          name: 'Fetch data',
          position: { x: 0, y: 0 },
          code: 'return { ok: true };',
        },
        { ...validCustomNode, id: 'custom-1' },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'custom-1' }],
      entryNodeId: 'step-1',
    }
    const result = workflowIRSchema.safeParse(mixedIR)
    expect(result.success).toBe(true)
  })
})
