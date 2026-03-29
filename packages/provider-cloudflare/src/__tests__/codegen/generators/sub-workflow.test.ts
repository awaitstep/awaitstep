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
      workflowId: 'wf_abc',
      workflowName: 'order-fulfillment',
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
    expect(code).toContain('Create order-fulfillment')
    expect(code).toContain('ORDER_FULFILLMENT_WORKFLOW')
    expect(code).toContain('Await order-fulfillment')
    expect(code).toContain('retries:')
    expect(code).toContain('NonRetryableError')
    expect(code).toContain('params: charge_result')
  })

  it('generates fire-and-forget pattern', () => {
    const code = generateSubWorkflow(subNode({ waitForCompletion: false }))
    expect(code).toContain('Create order-fulfillment')
    expect(code).toContain('ORDER_FULFILLMENT_WORKFLOW')
    expect(code).not.toContain('Await order-fulfillment')
    expect(code).not.toContain('retries:')
  })

  it('omits params when no input', () => {
    const code = generateSubWorkflow(subNode({ input: '' }))
    expect(code).not.toContain('params:')
  })
})

describe('getSubWorkflowBindings', () => {
  it('collects unique workflow bindings', () => {
    const nodes = [
      subNode(),
      { ...subNode(), id: 'sub-2', data: { ...subNode().data, workflowName: 'send-email' } },
    ]
    const bindings = getSubWorkflowBindings(nodes)
    expect(bindings).toContain('ORDER_FULFILLMENT_WORKFLOW')
    expect(bindings).toContain('SEND_EMAIL_WORKFLOW')
    expect(bindings).toHaveLength(2)
  })

  it('ignores non sub_workflow nodes', () => {
    const nodes = [{ type: 'step', data: { workflowName: 'should-ignore' } }]
    const bindings = getSubWorkflowBindings(nodes)
    expect(bindings).toHaveLength(0)
  })
})
