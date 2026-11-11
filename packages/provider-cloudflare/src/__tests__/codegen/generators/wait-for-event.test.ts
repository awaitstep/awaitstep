import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWaitForEvent as generateWaitForEventImpl } from '@awaitstep/codegen'

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 'wait-1',
    type: 'wait_for_event',
    name: 'Wait for approval',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { eventType: 'user-approval' },
    ...overrides,
  }
}

function ir(nodes: WorkflowNode[], edges: WorkflowIR['edges'] = []): WorkflowIR {
  return {
    metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
    nodes,
    edges,
    entryNodeId: nodes[0]?.id ?? '',
  }
}

const generateWaitForEvent = (
  node: WorkflowNode,
  graph = ir([node]),
  generateNode: (node: WorkflowNode) => string = () => '',
) => generateWaitForEventImpl(node, graph, ctx, generateNode as never)

describe('generateWaitForEvent', () => {
  it('generates a guarded wait with the event/timeout arms', () => {
    const wait = makeNode({
      data: {
        eventType: 'user-approval',
        timeout: '48 hours',
        onEventNode: 'event',
        onTimeoutNode: 'timeout',
      },
    })
    const event = makeNode({ id: 'event', type: 'step', data: { code: 'return 1;' } })
    const timeout = makeNode({ id: 'timeout', type: 'step', data: { code: 'return 2;' } })
    const code = generateWaitForEvent(
      wait,
      ir(
        [wait, event, timeout],
        [
          { id: 'e1', source: 'wait-1', target: 'event', label: 'onEvent' },
          { id: 'e2', source: 'wait-1', target: 'timeout', label: 'onTimeout' },
        ],
      ),
      (node) => `// ${node.id}`,
    )
    expect(code).toContain('const wait_1 = await waitForEventOrTimeout(flow, "wait-1", {')
    expect(code).toContain('type: "user-approval",')
    expect(code).toContain('timeout: "48 hours",')
    expect(code).toContain('if (typeof wait_1 === "symbol") {')
    expect(code).toContain('// event')
    expect(code).toContain('// timeout')
    // No binding outside the wait, and no catch in the generated code: the
    // helper owns it. Both authored branches run after the wait, so their
    // errors propagate.
    expect(code).not.toMatch(/^let /m)
    expect(code).not.toContain('try {')
    expect(code).not.toContain('.catch(')
    expect(code.indexOf('// event')).toBeGreaterThan(code.indexOf('waitForEventOrTimeout'))
    expect(code.indexOf('// timeout')).toBeGreaterThan(code.indexOf('waitForEventOrTimeout'))
  })

  it('includes a numeric timeout', () => {
    const code = generateWaitForEvent(
      makeNode({ data: { eventType: 'user-approval', timeout: 3600000 } }),
    )
    expect(code).toContain('timeout: 3600000')
  })

  it('uses the 365-day default when a legacy node has no timeout', () => {
    expect(generateWaitForEvent(makeNode())).toContain('timeout: "365 days"')
  })

  it('sanitizes the node id for the variable name', () => {
    const code = generateWaitForEvent(makeNode({ id: 'wait-for-payment' }))
    expect(code).toContain(
      'const wait_for_payment = await waitForEventOrTimeout(flow, "wait-for-payment", {',
    )
    expect(code).toContain('if (typeof wait_for_payment === "symbol") {')
  })

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
    const code = generateWaitForEvent(makeNode({ name: 'Wait for "yes"' }))
    expect(code).toContain('waitForEventOrTimeout(flow, "wait-1"')
    expect(code).not.toContain('yes')
  })
})
