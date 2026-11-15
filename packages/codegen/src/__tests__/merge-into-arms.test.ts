import { describe, expect, it } from 'vitest'
import { validateIR, type WorkflowIR, type WorkflowNode } from '@awaitstep/ir'
import { generateUniversalWorkflow } from '../graph/universal.js'

function step(id: string, name: string): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    version: '1.0.0',
    provider: 'cloudflare',
    position: { x: 0, y: 0 },
    data: { code: `export default async function ${name}() { return 1 }\n` },
  }
}

function workflow(nodes: WorkflowNode[], edges: WorkflowIR['edges']): WorkflowIR {
  return {
    kind: 'workflow',
    irVersion: 3,
    metadata: { name: 'w', version: 1, createdAt: 't', updatedAt: 't' },
    nodes,
    edges,
    entryNodeId: nodes[0]!.id,
  } as WorkflowIR
}

/** The text between two markers of the generated code. */
function between(code: string, from: string, to: string): string {
  const start = code.indexOf(from)
  return code.slice(start, code.indexOf(to, start + from.length))
}

describe('an arm leading straight into the node the other arm ends at', () => {
  it('runs it on the wait’s timeout path, and after sunny on its event path', () => {
    const wait: WorkflowNode = {
      ...step('w', 'Wait'),
      type: 'wait_for_event',
      data: {
        eventType: 'sunny',
        timeout: '30 seconds',
        onEventNode: 'sunny',
        onTimeoutNode: 'hello',
      },
    }
    const code = generateUniversalWorkflow(
      workflow(
        [wait, step('sunny', 'Sunny'), step('hello', 'Hello')],
        [
          { id: 'e', source: 'w', target: 'sunny', label: 'onEvent' },
          { id: 't', source: 'w', target: 'hello', label: 'onTimeout' },
          { id: 'sh', source: 'sunny', target: 'hello' },
        ],
      ),
    )
    const timeout = between(code, 'typeof Wait === "symbol"', '} else {')
    const event = between(code, '} else {', '\n    }')
    expect(timeout).toContain('$Hello(')
    expect(event).toContain('$Sunny(')
    expect(event).toContain('$Hello(')
    expect(event.indexOf('$Sunny(')).toBeLessThan(event.indexOf('$Hello('))
    // Not again after the wait.
    expect(code.split('$Hello(').length - 1).toBe(2)
  })

  it('runs it on each branch arm the same way', () => {
    const branch: WorkflowNode = {
      ...step('br', 'Gate'),
      type: 'branch',
      data: {
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      },
    }
    const code = generateUniversalWorkflow(
      workflow(
        [branch, step('x', 'Prep'), step('j', 'Join')],
        [
          { id: 'a', source: 'br', target: 'j', label: 'yes' },
          { id: 'b', source: 'br', target: 'x', label: 'no' },
          { id: 'xj', source: 'x', target: 'j' },
        ],
      ),
    )
    expect(code.split('$Join(').length - 1).toBe(2)
    const no = between(code, '} else {', '\n    }')
    expect(no.indexOf('$Prep(')).toBeLessThan(no.indexOf('$Join('))
  })
})

describe('a merge one arm reaches through a block’s way on', () => {
  it('runs it after the block in that arm, and alone in the other', () => {
    const branch: WorkflowNode = {
      ...step('br', 'Gate'),
      type: 'branch',
      data: {
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      },
    }
    const loop: WorkflowNode = {
      ...step('lp', 'Each'),
      type: 'loop',
      data: { loopType: 'times', count: 2 },
    }
    const code = generateUniversalWorkflow(
      workflow(
        [branch, loop, step('in', 'Inner'), step('j', 'Join')],
        [
          { id: 'y', source: 'br', target: 'j', label: 'yes' },
          { id: 'n', source: 'br', target: 'lp', label: 'no' },
          { id: 'b', source: 'lp', target: 'in', label: 'body' },
          { id: 't', source: 'lp', target: 'j', label: 'then' },
        ],
      ),
    )
    expect(code.split('$Join(').length - 1).toBe(2)
    const no = code.slice(code.indexOf('} else {'))
    expect(no.indexOf('$Inner(')).toBeLessThan(no.indexOf('$Join('))
  })
})

describe('merges the generator and IR validation judge alike', () => {
  const gate = (): WorkflowNode => ({
    ...step('br', 'Gate'),
    type: 'branch',
    data: {
      branches: [
        { label: 'a', condition: 'true' },
        { label: 'b', condition: '' },
      ],
    },
  })

  it('takes the node an arm leads straight into when the arms meet at two', () => {
    const ir = workflow(
      [gate(), step('j', 'Join'), step('b1', 'Prep'), step('k', 'Last')],
      [
        { id: 'a', source: 'br', target: 'j', label: 'a' },
        { id: 'b', source: 'br', target: 'b1', label: 'b' },
        { id: 'bj', source: 'b1', target: 'j' },
        { id: 'bk', source: 'b1', target: 'k' },
        { id: 'jk', source: 'j', target: 'k' },
      ],
    )
    expect(validateIR(ir).ok).toBe(true)
    const code = generateUniversalWorkflow(ir)
    expect(code.split('$Join(').length - 1).toBe(2)
  })

  it('refuses a branch arm under a label that isn’t one of its conditions', () => {
    const ir = workflow(
      [gate(), step('b1', 'Prep'), step('j', 'Join')],
      [
        { id: 'a', source: 'br', target: 'b1', label: 'a' },
        { id: 'z', source: 'br', target: 'j', label: 'z' },
        { id: 'bj', source: 'b1', target: 'j' },
      ],
    )
    expect(validateIR(ir).ok).toBe(false)
  })

  it('refuses a wait whose arm field names a node that is gone', () => {
    const wait: WorkflowNode = {
      ...step('w', 'Wait'),
      type: 'wait_for_event',
      data: { eventType: 'x', timeout: '30 seconds', onEventNode: 'ghost' },
    }
    const ir = workflow(
      [wait, step('t1', 'Late'), step('j', 'Join')],
      [
        { id: 'e', source: 'w', target: 'j', label: 'onEvent' },
        { id: 't', source: 'w', target: 't1', label: 'onTimeout' },
        { id: 'tj', source: 't1', target: 'j' },
      ],
    )
    expect(validateIR(ir).ok).toBe(false)
  })
})
