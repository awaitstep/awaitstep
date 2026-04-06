import { describe, it, expect } from 'vitest'
import {
  generateSubWorkflow,
  getSubWorkflowBindings,
} from '../../../codegen/generators/sub-workflow.js'
import type { WorkflowNode } from '@awaitstep/ir'

const V = '1.0.0'
const P = 'cloudflare'

function subNode(overrides: Partial<WorkflowNode['data']> = {}): WorkflowNode {
  return {
    id: 'sub-1',
    type: 'sub_workflow',
    name: 'Run Fulfillment',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: {
      workflowId: 'awaitstep-abc123',
      workflowName: 'OrderFulfillment',
      input: 'charge_result',
      waitForCompletion: true,
      timeout: '5 minutes',
      ...overrides,
    },
  }
}

describe('generateSubWorkflow', () => {
  it('generates wait-for-completion two-step pattern', () => {
    const code = generateSubWorkflow(subNode())
    expect(code).toContain('Create OrderFulfillment')
    expect(code).toContain('ORDER_FULFILLMENT')
    expect(code).toContain('Await OrderFulfillment')
    expect(code).toContain('retries:')
    expect(code).toContain('NonRetryableError')
    expect(code).toContain('params: charge_result')
  })

  it('generates fire-and-forget pattern', () => {
    const code = generateSubWorkflow(subNode({ waitForCompletion: false }))
    expect(code).toContain('Create OrderFulfillment')
    expect(code).toContain('ORDER_FULFILLMENT')
    expect(code).not.toContain('Await OrderFulfillment')
    expect(code).not.toContain('retries:')
  })

  it('omits params when no input', () => {
    const code = generateSubWorkflow(subNode({ input: '' }))
    expect(code).not.toContain('params:')
  })
})

describe('getSubWorkflowBindings', () => {
  it('collects unique workflow bindings with class names', () => {
    const nodes = [
      subNode(),
      {
        ...subNode(),
        id: 'sub-2',
        data: { ...subNode().data, workflowName: 'SendEmail', workflowId: 'awaitstep-xyz' },
      },
    ]
    const bindings = getSubWorkflowBindings(nodes)
    expect(bindings).toHaveLength(2)
    expect(bindings[0]).toEqual({
      binding: 'ORDER_FULFILLMENT',
      name: 'Order-Fulfillment',
      className: 'OrderFulfillment',
      scriptName: 'awaitstep-abc123',
    })
    expect(bindings[1]).toEqual({
      binding: 'SEND_EMAIL',
      name: 'Send-Email',
      className: 'SendEmail',
      scriptName: 'awaitstep-xyz',
    })
  })

  it('ignores non sub_workflow nodes', () => {
    const nodes = [{ type: 'step', data: { workflowName: 'should-ignore' } }]
    const bindings = getSubWorkflowBindings(nodes)
    expect(bindings).toHaveLength(0)
  })
})
