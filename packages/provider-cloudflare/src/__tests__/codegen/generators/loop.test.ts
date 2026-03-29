import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateLoop } from '../../../codegen/generators/loop.js'
import { generateNodeCode } from '../../../codegen/generate.js'

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
    expect(code).toContain('await step.do("My Loop"')
    expect(code).toContain('for (let _loop_i')
  })

  it('generates forEach loop', () => {
    const ir = makeLoopIR(
      { loopType: 'forEach', collection: 'get_customers.customers', itemVar: 'customer' },
      [step('send', 'Send Email')],
    )
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('for (const customer of get_customers.customers)')
    expect(code).toContain('Send Email [${_loop_i}]')
    expect(code).toContain('let _loop_i = 0')
  })

  it('generates while loop without condition (while true)', () => {
    const ir = makeLoopIR({ loopType: 'while' }, [step('poll', 'Poll Status')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('while (true)')
    expect(code).toContain('Poll Status')
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
    expect(code).toContain('Do Work')
  })

  it('suffixes step names with loop counter for CF idempotency', () => {
    const ir = makeLoopIR({ loopType: 'times', count: 3 }, [step('work', 'Do Work')])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('Do Work [${_loop_i}]')
    expect(code).not.toContain('step.do("Do Work"')
  })

  it('chains multiple body nodes', () => {
    const ir = makeLoopIR({ loopType: 'forEach', collection: 'items', itemVar: 'item' }, [
      step('s1', 'Step 1'),
      step('s2', 'Step 2'),
    ])
    const code = generateLoop(ir.nodes[0]!, ir, generateNodeCode)
    expect(code).toContain('Step 1 [${_loop_i}]')
    expect(code).toContain('Step 2 [${_loop_i}]')
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
