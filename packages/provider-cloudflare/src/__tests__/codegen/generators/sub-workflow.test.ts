import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import {
  generateSubWorkflow as generateSubWorkflowImpl,
  getSubWorkflowBindings,
} from '../../../codegen/generators/sub-workflow.js'
import type { WorkflowNode } from '@awaitstep/ir'

const generateSubWorkflow = (
  node: Parameters<typeof generateSubWorkflowImpl>[0],
  mode?: Parameters<typeof generateSubWorkflowImpl>[2],
) => generateSubWorkflowImpl(node, ctx, mode)

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
    expect(code).toContain('flow.step("sub-1--create"')
    expect(code).toContain('ORDER_FULFILLMENT')
    expect(code).toContain('flow.step("sub-1--await"')
    expect(code).toContain('retries:')
    expect(code).toContain('NonRetryableError')
    expect(code).toContain('params: charge_result')
  })

  it('accesses the workflow binding through the Cloudflare primitive', () => {
    const code = generateSubWorkflow(subNode())
    expect(code).toContain('import { workflow } from "#awaitstep/cloudflare"')
    expect(code).toContain('await workflow(env, "ORDER_FULFILLMENT").create(')
    expect(code).toContain('await workflow(env, "ORDER_FULFILLMENT").get(')
    expect(code).not.toContain('env.ORDER_FULFILLMENT')
  })

  it('quotes a hostile workflow name so it cannot break out of the call', () => {
    const code = generateSubWorkflow(subNode({ workflowName: 'X"; console.log("pwned"); //' }))
    const match = code.match(/workflow\(env, (.*?)\)\.create/)
    expect(match).not.toBeNull()
    expect(() => JSON.parse(match![1]!)).not.toThrow()
  })

  it('generates fire-and-forget pattern', () => {
    const code = generateSubWorkflow(subNode({ waitForCompletion: false }))
    expect(code).toContain('flow.step("sub-1--create"')
    expect(code).toContain('ORDER_FULFILLMENT')
    expect(code).not.toContain('flow.step("sub-1--await"')
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

describe('generateSubWorkflow in script mode', () => {
  it('emits a single fire-and-forget create call (no step.do, no polling)', () => {
    const code = generateSubWorkflow(subNode(), 'script')
    expect(code).not.toContain('flow.step')
    expect(code).not.toContain('flow.step("sub-1--await"')
    expect(code).not.toContain('NonRetryableError')
    // The node's varName is the WorkflowInstance handle directly — callers
    // can read `.id`, `.status()`, etc. No second `{ instanceId: ... }` line.
    expect(code).toMatch(/const sub_1 = await env\["ORDER_FULFILLMENT"\]\.create\(\{/)
    expect(code).toContain('params: charge_result')
    expect(code).not.toContain('sub_1_instance')
    expect(code).not.toContain('instanceId:')
  })

  it('ignores waitForCompletion in script mode (always fire-and-forget)', () => {
    const code = generateSubWorkflow(subNode({ waitForCompletion: true }), 'script')
    expect(code).not.toContain('flow.step("sub-1--await"')
    expect(code).not.toContain('retries:')
  })
})
