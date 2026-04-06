import { describe, it, expect } from 'vitest'
import { validateIR } from '../validate.js'
import type { WorkflowNode } from '../types.js'

function node(id: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type: 'step',
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: 'return 1;' },
    ...overrides,
  }
}

const meta = {
  name: 'test',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('try_catch validation', () => {
  it('accepts valid try/catch', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [node('tc', { type: 'try_catch', data: {} }), node('try-step'), node('catch-step')],
      edges: [
        { id: 'e1', source: 'tc', target: 'try-step', label: 'try' },
        { id: 'e2', source: 'tc', target: 'catch-step', label: 'catch' },
      ],
      entryNodeId: 'tc',
    })
    expect(result.ok).toBe(true)
  })

  it('accepts try/catch/finally', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('tc', { type: 'try_catch', data: {} }),
        node('try-step'),
        node('catch-step'),
        node('finally-step'),
      ],
      edges: [
        { id: 'e1', source: 'tc', target: 'try-step', label: 'try' },
        { id: 'e2', source: 'tc', target: 'catch-step', label: 'catch' },
        { id: 'e3', source: 'tc', target: 'finally-step', label: 'finally' },
      ],
      entryNodeId: 'tc',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects try_catch missing try edge', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [node('tc', { type: 'try_catch', data: {} }), node('catch-step')],
      edges: [{ id: 'e1', source: 'tc', target: 'catch-step', label: 'catch' }],
      entryNodeId: 'tc',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('"try" edge'))).toBe(true)
    }
  })

  it('rejects try_catch missing catch edge', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [node('tc', { type: 'try_catch', data: {} }), node('try-step')],
      edges: [{ id: 'e1', source: 'tc', target: 'try-step', label: 'try' }],
      entryNodeId: 'tc',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('"catch" edge'))).toBe(true)
    }
  })

  it('rejects invalid edge labels on try_catch', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('tc', { type: 'try_catch', data: {} }),
        node('try-step'),
        node('catch-step'),
        node('bad-step'),
      ],
      edges: [
        { id: 'e1', source: 'tc', target: 'try-step', label: 'try' },
        { id: 'e2', source: 'tc', target: 'catch-step', label: 'catch' },
        { id: 'e3', source: 'tc', target: 'bad-step', label: 'invalid' },
      ],
      entryNodeId: 'tc',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('"invalid"'))).toBe(true)
    }
  })
})

describe('loop validation', () => {
  it('accepts valid forEach loop', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: {
            loopType: 'forEach',
            collection: '{{items}}',
            itemVar: 'item',
          },
        }),
        node('body-step'),
      ],
      edges: [{ id: 'e1', source: 'loop', target: 'body-step', label: 'body' }],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(true)
  })

  it('accepts valid while loop', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: { loopType: 'while' },
        }),
        node('body-step'),
      ],
      edges: [{ id: 'e1', source: 'loop', target: 'body-step', label: 'body' }],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(true)
  })

  it('accepts valid times loop', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: { loopType: 'times', count: 5 },
        }),
        node('body-step'),
      ],
      edges: [{ id: 'e1', source: 'loop', target: 'body-step', label: 'body' }],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects loop without body edge', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: {
            loopType: 'forEach',
            collection: '{{items}}',
            itemVar: 'item',
          },
        }),
      ],
      edges: [],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('"body" edge'))).toBe(true)
    }
  })

  it('rejects invalid loopType', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: { loopType: 'invalid' },
        }),
        node('body-step'),
      ],
      edges: [{ id: 'e1', source: 'loop', target: 'body-step', label: 'body' }],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('loopType'))).toBe(true)
    }
  })

  it('rejects forEach loop without collection', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: { loopType: 'forEach' },
        }),
        node('body-step'),
      ],
      edges: [{ id: 'e1', source: 'loop', target: 'body-step', label: 'body' }],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('collection'))).toBe(true)
    }
  })

  it('rejects nested loops', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('outer', {
          type: 'loop',
          data: { loopType: 'times', count: 3 },
        }),
        node('inner', {
          type: 'loop',
          data: { loopType: 'times', count: 2, maxIterations: 2 },
        }),
        node('body-step'),
      ],
      edges: [
        { id: 'e1', source: 'outer', target: 'inner', label: 'body' },
        { id: 'e2', source: 'inner', target: 'body-step', label: 'body' },
      ],
      entryNodeId: 'outer',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('Nested loops'))).toBe(true)
    }
  })
})

describe('exit (break/return) validation', () => {
  it('accepts exit inside loop body', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('loop', {
          type: 'loop',
          data: { loopType: 'while' },
        }),
        node('work', { data: { code: 'return 1;' } }),
        node('brk', { type: 'break', data: { condition: 'work.done' } }),
      ],
      edges: [
        { id: 'e1', source: 'loop', target: 'work', label: 'body' },
        { id: 'e2', source: 'work', target: 'brk' },
      ],
      entryNodeId: 'loop',
    })
    expect(result.ok).toBe(true)
  })

  it('accepts exit outside loop (generates return)', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('step1', { data: { code: 'return 1;' } }),
        node('brk', { type: 'break', data: {} }),
      ],
      edges: [{ id: 'e1', source: 'step1', target: 'brk' }],
      entryNodeId: 'step1',
    })
    expect(result.ok).toBe(true)
  })
})

describe('sub_workflow validation', () => {
  it('accepts valid sub_workflow', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('sub', {
          type: 'sub_workflow',
          data: {
            workflowId: 'wf_abc',
            workflowName: 'order-fulfillment',
            waitForCompletion: true,
          },
        }),
      ],
      edges: [],
      entryNodeId: 'sub',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects sub_workflow without workflowName', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('sub', {
          type: 'sub_workflow',
          data: { workflowId: 'wf_abc' },
        }),
      ],
      edges: [],
      entryNodeId: 'sub',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('workflowName'))).toBe(true)
    }
  })

  it('rejects sub_workflow without workflowId', () => {
    const result = validateIR({
      metadata: meta,
      nodes: [
        node('sub', {
          type: 'sub_workflow',
          data: { workflowName: 'order-fulfillment' },
        }),
      ],
      edges: [],
      entryNodeId: 'sub',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('script name'))).toBe(true)
    }
  })
})
