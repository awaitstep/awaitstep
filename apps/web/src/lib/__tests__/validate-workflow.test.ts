import { describe, it, expect } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { WorkflowMetadata, WorkflowNode } from '@awaitstep/ir'
import { validateWorkflowForPublish } from '../validate-workflow'
import type { FlowNode } from '../../stores/workflow-store'

function makeMetadata(overrides: Partial<WorkflowMetadata> = {}): WorkflowMetadata {
  return {
    name: 'Test Workflow',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeFlowNode(irNode: WorkflowNode): FlowNode {
  return {
    id: irNode.id,
    type: irNode.type,
    position: irNode.position,
    data: { irNode },
  }
}

function makeStepNode(id: string, overrides: Partial<{ name: string; code: string }> = {}): FlowNode {
  return makeFlowNode({
    id,
    type: 'step',
    name: overrides.name ?? 'My Step',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: overrides.code ?? 'return { ok: true };' },
  })
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return { id: `${source}-${target}`, source, target, ...(label ? { label } : {}) }
}

describe('validateWorkflowForPublish', () => {
  // ── Workflow-level ──

  describe('workflow-level', () => {
    it('errors when workflow name is empty', () => {
      const result = validateWorkflowForPublish(makeMetadata({ name: '' }), [makeStepNode('s1')], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', nodeId: null, message: 'Workflow name is empty' }),
      )
      expect(result.canPublish).toBe(false)
    })

    it('errors when workflow name is whitespace', () => {
      const result = validateWorkflowForPublish(makeMetadata({ name: '   ' }), [makeStepNode('s1')], [])
      expect(result.canPublish).toBe(false)
    })

    it('errors when no nodes', () => {
      const result = validateWorkflowForPublish(makeMetadata(), [], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'No nodes in workflow' }),
      )
      expect(result.canPublish).toBe(false)
    })

    it('errors on cycle', () => {
      const nodes = [makeStepNode('a'), makeStepNode('b')]
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')]
      const result = validateWorkflowForPublish(makeMetadata(), nodes, edges)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Graph contains a cycle' }),
      )
    })

    it('errors on unreachable node', () => {
      const nodes = [makeStepNode('a'), makeStepNode('b'), makeStepNode('c')]
      const edges = [makeEdge('a', 'b')]
      const result = validateWorkflowForPublish(makeMetadata(), nodes, edges)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', nodeId: 'c' }),
      )
      expect(result.canPublish).toBe(false)
    })
  })

  // ── step ──

  describe('step', () => {
    it('errors when name is empty', () => {
      const result = validateWorkflowForPublish(makeMetadata(), [makeStepNode('s1', { name: '' })], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Step name is empty' }),
      )
    })

    it('errors when code is empty', () => {
      const result = validateWorkflowForPublish(makeMetadata(), [makeStepNode('s1', { code: '' })], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Step code is empty' }),
      )
    })

    it('errors on nested step call', () => {
      const code = 'await step.do("inner", async (ctx) => {\n  await step.do("bad", async (ctx) => { return 1; });\n});'
      const result = validateWorkflowForPublish(makeMetadata(), [makeStepNode('s1', { code })], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Nested step call detected in code body' }),
      )
    })

    it('passes for valid step', () => {
      const result = validateWorkflowForPublish(makeMetadata(), [makeStepNode('s1')], [])
      expect(result.canPublish).toBe(true)
      expect(result.issues.filter((i) => i.nodeId === 's1' && i.severity === 'error')).toHaveLength(0)
    })
  })

  // ── sleep ──

  describe('sleep', () => {
    it('errors when duration is 0', () => {
      const node = makeFlowNode({ id: 's1', type: 'sleep', name: 'Wait', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: { duration: 0 } })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Duration is 0 or negative' }),
      )
    })

    it('errors when duration exceeds 365 days', () => {
      const node = makeFlowNode({ id: 's1', type: 'sleep', name: 'Wait', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: { duration: '366 days' } })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Duration exceeds 365 days' }),
      )
    })

    it('passes for valid duration', () => {
      const node = makeFlowNode({ id: 's1', type: 'sleep', name: 'Wait', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: { duration: '10 seconds' } })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues.filter((i) => i.nodeId === 's1' && i.severity === 'error')).toHaveLength(0)
    })
  })

  // ── sleep-until ──

  describe('sleep_until', () => {
    it('errors when timestamp is empty', () => {
      const node = makeFlowNode({ id: 's1', type: 'sleep_until', name: 'Wait', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: { timestamp: '' } })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Timestamp is empty' }),
      )
    })

    it('errors when timestamp is invalid', () => {
      const node = makeFlowNode({ id: 's1', type: 'sleep_until', name: 'Wait', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: { timestamp: 'not-a-date' } })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Timestamp is not a valid date' }),
      )
    })

    it('passes for valid timestamp', () => {
      const node = makeFlowNode({ id: 's1', type: 'sleep_until', name: 'Wait', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: { timestamp: '2026-06-01T00:00:00Z' } })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues.filter((i) => i.nodeId === 's1' && i.severity === 'error')).toHaveLength(0)
    })
  })

  // ── branch ──

  describe('branch', () => {
    it('errors with fewer than 2 branches', () => {
      const node = makeFlowNode({
        id: 'b1', type: 'branch', name: 'Check', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'true' }] },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Fewer than 2 branches' }),
      )
    })

    it('errors on duplicate branch labels', () => {
      const node = makeFlowNode({
        id: 'b1', type: 'branch', name: 'Check', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'true' }, { label: 'yes', condition: '' }] },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Duplicate branch label: "yes"' }),
      )
    })

    it('errors when branch with condition has no connected target', () => {
      const node = makeFlowNode({
        id: 'b1', type: 'branch', name: 'Check', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'x > 0' }, { label: 'no', condition: '' }] },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Branch "yes" has no connected target' }),
      )
    })

    it('warns when no default/else branch', () => {
      const node = makeFlowNode({
        id: 'b1', type: 'branch', name: 'Check', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'x > 0' }, { label: 'no', condition: 'x <= 0' }] },
      })
      const edges = [makeEdge('b1', 't1', 'yes'), makeEdge('b1', 't2', 'no')]
      const targets = [makeStepNode('t1'), makeStepNode('t2')]
      const result = validateWorkflowForPublish(makeMetadata(), [node, ...targets], edges)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'warning', message: 'No default/else branch' }),
      )
    })

    it('passes for valid branch with default', () => {
      const node = makeFlowNode({
        id: 'b1', type: 'branch', name: 'Check', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'x > 0' }, { label: 'else', condition: '' }] },
      })
      const edges = [makeEdge('b1', 't1', 'yes'), makeEdge('b1', 't2', 'else')]
      const targets = [makeStepNode('t1'), makeStepNode('t2')]
      const result = validateWorkflowForPublish(makeMetadata(), [node, ...targets], edges)
      const branchErrors = result.issues.filter((i) => i.nodeId === 'b1' && i.severity === 'error')
      expect(branchErrors).toHaveLength(0)
    })
  })

  // ── parallel ──

  describe('parallel', () => {
    it('errors with 0 outgoing edges', () => {
      const node = makeFlowNode({ id: 'p1', type: 'parallel', name: 'Fan Out', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: {} })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: '0 outgoing edges' }),
      )
    })

    it('warns with only 1 outgoing edge', () => {
      const node = makeFlowNode({ id: 'p1', type: 'parallel', name: 'Fan Out', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: {} })
      const result = validateWorkflowForPublish(makeMetadata(), [node, makeStepNode('t1')], [makeEdge('p1', 't1')])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'warning', message: 'Only 1 outgoing edge' }),
      )
    })

    it('passes with 2+ outgoing edges', () => {
      const node = makeFlowNode({ id: 'p1', type: 'parallel', name: 'Fan Out', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: {} })
      const edges = [makeEdge('p1', 't1'), makeEdge('p1', 't2')]
      const result = validateWorkflowForPublish(makeMetadata(), [node, makeStepNode('t1'), makeStepNode('t2')], edges)
      const parallelIssues = result.issues.filter((i) => i.nodeId === 'p1')
      expect(parallelIssues).toHaveLength(0)
    })
  })

  // ── http-request ──

  describe('http_request', () => {
    it('errors when url is empty', () => {
      const node = makeFlowNode({
        id: 'h1', type: 'http_request', name: 'Fetch', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { url: '', method: 'GET' },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'URL is empty' }),
      )
    })

    it('errors when method is missing', () => {
      const node = makeFlowNode({
        id: 'h1', type: 'http_request', name: 'Fetch', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { url: 'https://example.com', method: '' },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Method is missing' }),
      )
    })
  })

  // ── wait-for-event ──

  describe('wait_for_event', () => {
    it('errors when eventType is empty', () => {
      const node = makeFlowNode({
        id: 'w1', type: 'wait_for_event', name: 'Wait', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { eventType: '' },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Event type is empty' }),
      )
    })

    it('errors when eventType has invalid characters', () => {
      const node = makeFlowNode({
        id: 'w1', type: 'wait_for_event', name: 'Wait', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { eventType: 'my.event' },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'Event type has invalid characters' }),
      )
    })

    it('passes for valid eventType', () => {
      const node = makeFlowNode({
        id: 'w1', type: 'wait_for_event', name: 'Wait', position: { x: 0, y: 0 },
        version: '1.0.0', provider: 'cloudflare',
        data: { eventType: 'my-event_123' },
      })
      const result = validateWorkflowForPublish(makeMetadata(), [node], [])
      expect(result.issues.filter((i) => i.nodeId === 'w1' && i.severity === 'error')).toHaveLength(0)
    })
  })

  // ── canPublish ──

  describe('canPublish', () => {
    it('is true for a clean workflow', () => {
      const nodes = [makeStepNode('a'), makeStepNode('b')]
      const edges = [makeEdge('a', 'b')]
      const result = validateWorkflowForPublish(makeMetadata(), nodes, edges)
      expect(result.canPublish).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('is true with only warnings', () => {
      // Parallel with 1 edge produces a warning
      const nodes = [
        makeFlowNode({ id: 'p', type: 'parallel', name: 'Fan', position: { x: 0, y: 0 }, version: '1.0.0', provider: 'cloudflare', data: {} }),
        makeStepNode('a'),
      ]
      const edges = [makeEdge('p', 'a')]
      const result = validateWorkflowForPublish(makeMetadata(), nodes, edges)
      expect(result.canPublish).toBe(true)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues.every((i) => i.severity === 'warning')).toBe(true)
    })

    it('is false with any error', () => {
      const result = validateWorkflowForPublish(makeMetadata({ name: '' }), [makeStepNode('s1')], [])
      expect(result.canPublish).toBe(false)
    })
  })
})
