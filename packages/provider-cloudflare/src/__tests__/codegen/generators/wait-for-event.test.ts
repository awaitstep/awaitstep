import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateWaitForEvent as generateWaitForEventImpl } from '@awaitstep/codegen'

const generateWaitForEvent = (node: Parameters<typeof generateWaitForEventImpl>[0]) =>
  generateWaitForEventImpl(node, ctx)

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

describe('generateWaitForEvent', () => {
  it('generates basic wait for event', () => {
    const code = generateWaitForEvent(makeNode())
    expect(code).toContain('flow.waitForEvent("wait-1"')
    expect(code).toContain('type: "user-approval"')
    expect(code).toContain('const wait_1 =')
  })

  it('includes string timeout', () => {
    const code = generateWaitForEvent(
      makeNode({ data: { eventType: 'user-approval', timeout: '48 hours' } }),
    )
    expect(code).toContain('timeout: "48 hours"')
  })

  it('includes numeric timeout', () => {
    const code = generateWaitForEvent(
      makeNode({ data: { eventType: 'user-approval', timeout: 3600000 } }),
    )
    expect(code).toContain('timeout: 3600000')
  })

  it('omits timeout when not provided', () => {
    const code = generateWaitForEvent(makeNode())
    expect(code).not.toContain('timeout')
  })

  it('sanitizes node id for variable name', () => {
    const code = generateWaitForEvent(makeNode({ id: 'wait-for-payment' }))
    expect(code).toContain('const wait_for_payment =')
  })

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
    const code = generateWaitForEvent(makeNode({ name: 'Wait for "yes"' }))
    expect(code).toContain('waitForEvent("wait-1"')
    expect(code).not.toContain('yes')
  })
})
