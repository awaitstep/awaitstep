import { describe, it, expect } from 'vitest'
import { validateIR } from '../validate.js'
import simpleWorkflow from './fixtures/simple-workflow.json'
import branchingWorkflow from './fixtures/branching-workflow.json'

describe('validateIR', () => {
  it('accepts a valid simple workflow', () => {
    const result = validateIR(simpleWorkflow)
    expect(result.ok).toBe(true)
  })

  it('accepts a valid branching workflow', () => {
    const result = validateIR(branchingWorkflow)
    expect(result.ok).toBe(true)
  })

  it('rejects empty input', () => {
    const result = validateIR({})
    expect(result.ok).toBe(false)
  })

  it('rejects workflow with no nodes', () => {
    const result = validateIR({
      metadata: {
        name: 'empty',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [],
      edges: [],
      entryNodeId: 'nope',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects workflow with missing entry node', () => {
    const result = validateIR({
      ...simpleWorkflow,
      entryNodeId: 'nonexistent',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('does not exist'))).toBe(true)
    }
  })

  it('rejects workflow with duplicate node ids', () => {
    const result = validateIR({
      ...simpleWorkflow,
      nodes: [simpleWorkflow.nodes[0], { ...simpleWorkflow.nodes[1], id: 'step-1' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true)
    }
  })

  it('rejects workflow with edge referencing nonexistent node', () => {
    const result = validateIR({
      ...simpleWorkflow,
      edges: [{ id: 'e1', source: 'step-1', target: 'ghost' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('ghost'))).toBe(true)
    }
  })

  it('rejects workflow with a cycle', () => {
    const result = validateIR({
      metadata: {
        name: 'cyclic',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 }, code: 'return 1;' },
        { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 100 }, code: 'return 2;' },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
      entryNodeId: 'a',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('cycle'))).toBe(true)
    }
  })

  it('reports unreachable nodes', () => {
    const result = validateIR({
      metadata: {
        name: 'unreachable',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 }, code: 'return 1;' },
        { id: 'b', type: 'step', name: 'B', position: { x: 100, y: 0 }, code: 'return 2;' },
      ],
      edges: [],
      entryNodeId: 'a',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('not reachable'))).toBe(true)
    }
  })

  it('rejects invalid event type characters in wait-for-event', () => {
    const result = validateIR({
      metadata: {
        name: 'bad-event',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [
        {
          id: 'wait',
          type: 'wait-for-event',
          name: 'Wait',
          position: { x: 0, y: 0 },
          eventType: 'invalid.type.with.dots',
        },
      ],
      edges: [],
      entryNodeId: 'wait',
    })
    expect(result.ok).toBe(false)
  })

  it('accepts valid wait-for-event node', () => {
    const result = validateIR({
      metadata: {
        name: 'event-workflow',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      nodes: [
        {
          id: 'wait',
          type: 'wait-for-event',
          name: 'Wait for approval',
          position: { x: 0, y: 0 },
          eventType: 'user-approval',
          timeout: '24 hours',
        },
      ],
      edges: [],
      entryNodeId: 'wait',
    })
    expect(result.ok).toBe(true)
  })
})
