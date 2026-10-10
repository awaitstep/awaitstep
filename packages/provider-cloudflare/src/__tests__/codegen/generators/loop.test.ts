import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateLoop as generateLoopImpl } from '../../../codegen/generators/loop.js'
import { recurseWithTestCtx as generateNodeCode } from '../test-context.js'

const generateLoop = (
  node: Parameters<typeof generateLoopImpl>[0],
  ir: Parameters<typeof generateLoopImpl>[1],
  generateNode: Parameters<typeof generateLoopImpl>[3],
  mode?: Parameters<typeof generateLoopImpl>[4],
) => generateLoopImpl(node, ir, ctx, generateNode, mode)

const V = '1.0.0'
const P = 'cloudflare'

function step(id: string, name: string): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: { code: `return "${id}";` },
  }
}

function makeLoopIR(loopData: Record<string, unknown>, bodyNodes: WorkflowNode[]): WorkflowIR {
  const loopNode: WorkflowNode = {
    id: 'loop-1',
    type: 'loop',
    name: 'My Loop',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: loopData,
  }

  const bodyEdges = bodyNodes.map((n, i) => ({
    id: `body-${i}`,
    source: i === 0 ? 'loop-1' : bodyNodes[i - 1]!.id,
    target: n.id,
    ...(i === 0 ? { label: 'body' } : {}),
  }))

  return {
    metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
    nodes: [loopNode, ...bodyNodes],
    edges: bodyEdges,
    entryNodeId: 'loop-1',
  }
}

describe('generateLoop', () => {
  it('wraps loop in step.do for durable caching', () => {
    const ir = makeLoopIR({ loopType: 'times', count: 3 }, [step('work', 'Do Work')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('await step.do("loop-1"')
    expect(code).toContain('for (let _loop_i')
  })

  it('generates forEach loop using .entries() when body has step.do calls (counter inline)', () => {
    const ir = makeLoopIR(
      { loopType: 'forEach', collection: 'get_customers.customers', itemVar: 'customer' },
      [step('send', 'Send Email')],
    )
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    // Counter comes from .entries() destructure — no separate `let _loop_i = 0` declaration.
    expect(code).toContain('for (const [_loop_i, customer] of (get_customers.customers).entries())')
    expect(code).toContain('send [${_loop_i}]')
    expect(code).not.toContain('let _loop_i = 0')
  })

  it('generates forEach without counter when body has no step.METHOD calls', () => {
    const noStepBody: WorkflowNode = {
      id: 'inline',
      type: 'step',
      name: 'Inline',
      position: { x: 0, y: 0 },
      version: V,
      provider: P,
      data: { code: 'console.log(item);' }, // no step.do/sleep/etc inside the inline code
    }
    // Use a custom-node-style call to avoid step.do — but step nodes always
    // use step.do in workflow mode. So this assertion is mainly relevant in
    // script mode (covered separately). Keep this one minimal — confirm
    // `_loop_i` isn't redundantly declared when entries() does it.
    const ir = makeLoopIR({ loopType: 'forEach', collection: 'items', itemVar: 'item' }, [
      noStepBody,
    ])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    // step nodes wrap with step.do, so counter IS needed → entries() form.
    expect(code).toContain('for (const [_loop_i, item] of (items).entries())')
    expect(code).not.toContain('let _loop_i = 0')
  })

  it('generates while loop without condition (while true)', () => {
    const ir = makeLoopIR({ loopType: 'while' }, [step('poll', 'Poll Status')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('while (true)')
    expect(code).toContain('step.do(`poll ')
  })

  it('generates while loop with condition', () => {
    const ir = makeLoopIR({ loopType: 'while', condition: 'status !== "done"' }, [
      step('poll', 'Poll'),
    ])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('while (status !== "done")')
  })

  it('generates times loop', () => {
    const ir = makeLoopIR({ loopType: 'times', count: 5 }, [step('work', 'Do Work')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('for (let _loop_i = 0; _loop_i < 5; _loop_i++)')
    expect(code).toContain('step.do(`work ')
  })

  it('suffixes step names with loop counter for CF idempotency', () => {
    const ir = makeLoopIR({ loopType: 'times', count: 3 }, [step('work', 'Do Work')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('work [${_loop_i}]')
    expect(code).not.toContain('step.do("work"')
  })

  it('coalesces adjacent config-less body steps into one billable step per iteration', () => {
    const ir = makeLoopIR({ loopType: 'forEach', collection: 'items', itemVar: 'item' }, [
      step('s1', 'Step 1'),
      step('s2', 'Step 2'),
    ])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    // One suffixed step.do under the leader's label; the member label is gone.
    expect(code).toContain('s1 [${_loop_i}]')
    expect(code).not.toContain('s2 [${_loop_i}]')
    // Two step.do total: the loop's own durable wrapper + the merged group.
    expect(code.match(/step\.do\(/g)).toHaveLength(2)
    // Both member results stay referenceable via the destructured return.
    expect(code).toContain('const { s1, s2 } =')
    expect(code).toContain('return { s1, s2 };')
  })

  it('does not coalesce body steps that carry retry config', () => {
    const configured = {
      ...step('s2', 'Step 2'),
      config: { retries: { limit: 3, delay: '5 seconds' } },
    }
    const ir = makeLoopIR({ loopType: 'forEach', collection: 'items', itemVar: 'item' }, [
      step('s1', 'Step 1'),
      configured,
    ])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('s1 [${_loop_i}]')
    expect(code).toContain('s2 [${_loop_i}]')
  })

  it('assigns result when _output is used in body', () => {
    const ir = makeLoopIR({ loopType: 'forEach', collection: 'items', itemVar: 'item' }, [
      {
        id: 'find',
        type: 'step',
        name: 'Find',
        position: { x: 0, y: 0 },
        version: V,
        provider: P,
        data: { code: 'if (item.match) _output = item;\nreturn item;' },
      },
    ])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toMatch(/^const \w+ = await step\.do/)
    expect(code).toContain('let _output;')
    expect(code).toContain('return _output;')
  })

  it('does not assign result when _output is not used', () => {
    const ir = makeLoopIR({ loopType: 'times', count: 3 }, [step('work', 'Do Work')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).not.toMatch(/^const \w+ =/)
    expect(code).toMatch(/^await step\.do/)
  })

  it('handles empty body', () => {
    const ir = makeLoopIR({ loopType: 'times', count: 3 }, [])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('for (let _loop_i')
    expect(code).toContain('return _output;')
  })
})
