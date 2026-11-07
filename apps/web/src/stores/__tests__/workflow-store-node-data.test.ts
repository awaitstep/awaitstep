import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { useWorkflowStore } from '../workflow-store'

function irNode(id: string, data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id,
    type: 'step',
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: 'return 1;', ...data },
  }
}

function seed(...nodes: WorkflowNode[]) {
  useWorkflowStore.setState({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { irNode: n },
    })),
    edges: [],
    isDirty: false,
    readOnly: false,
  } as never)
}

function dataOf(id: string) {
  return useWorkflowStore.getState().nodes.find((n) => n.id === id)!.data.irNode.data
}

beforeEach(() => {
  useWorkflowStore.getState().reset()
})

describe('updateNodeData', () => {
  it('does nothing, and keeps the draft clean, for a node that is gone', () => {
    seed(irNode('a'))
    useWorkflowStore.getState().updateNodeData('gone', { data: { code: 'x' } })
    expect(useWorkflowStore.getState().isDirty).toBe(false)
    expect(dataOf('a')).toEqual({ code: 'return 1;' })
  })

  it('marks the draft dirty for a node that exists', () => {
    seed(irNode('a'))
    useWorkflowStore.getState().updateNodeData('a', { name: 'renamed' })
    expect(useWorkflowStore.getState().isDirty).toBe(true)
  })
})

describe('updateNodeField', () => {
  it('merges one field into the node as it is in the store now, not as a caller last saw it', () => {
    seed(irNode('a', { retryLimit: 1 }))
    // Something else changes the node first (a reload, another field's debounce).
    useWorkflowStore.getState().updateNodeField('a', 'timeout', '30 seconds')
    useWorkflowStore.getState().updateNodeField('a', 'code', 'return 2;')
    expect(dataOf('a')).toEqual({ code: 'return 2;', retryLimit: 1, timeout: '30 seconds' })
  })

  it('removes a field set to undefined instead of keeping an undefined key', () => {
    seed(irNode('a', { exportAs: 'User' }))
    useWorkflowStore.getState().updateNodeField('a', 'exportAs', undefined)
    expect(dataOf('a')).toEqual({ code: 'return 1;' })
    expect(useWorkflowStore.getState().isDirty).toBe(true)
  })

  it('ignores a node that is gone and a read-only draft', () => {
    seed(irNode('a'))
    useWorkflowStore.getState().updateNodeField('gone', 'code', 'x')
    expect(useWorkflowStore.getState().isDirty).toBe(false)
    useWorkflowStore.setState({ readOnly: true })
    useWorkflowStore.getState().updateNodeField('a', 'code', 'x')
    expect(dataOf('a')).toEqual({ code: 'return 1;' })
    expect(useWorkflowStore.getState().isDirty).toBe(false)
  })
})

describe('addNode', () => {
  it('opens a new step as its module, named as the worker will import it, unique among its siblings', () => {
    seed()
    const store = useWorkflowStore.getState()
    store.addNode('step', { x: 0, y: 0 })
    store.addNode('step', { x: 0, y: 0 })
    const [first, second] = useWorkflowStore.getState().nodes.map((n) => n.data.irNode)
    expect(first!.name).toBe('New step')
    expect(first!.data.code).toBe(
      'export default async function New_step({ env, event, inputs, step, ctx }) {\n  // Write your business logic here\n\n  return { result: "ok" };\n}\n',
    )
    expect(second!.data.code).toContain('export default async function New_step_2(')
  })
})

describe('renameNode', () => {
  const MODULE =
    'export default async function a({ env, event, inputs, step, ctx }) {\n  return 1;\n}\n'

  it('carries the new name into the module’s function when it still had the old one', () => {
    seed(irNode('a', { code: MODULE }))
    useWorkflowStore.getState().renameNode('a', 'fetch user')
    const node = useWorkflowStore.getState().nodes[0]!.data.irNode
    expect(node.name).toBe('fetch user')
    expect(node.data.code).toContain('export default async function fetch_user(')
  })

  it('leaves a function the person named themselves, and an inline step’s statements, alone', () => {
    seed(
      irNode('a', { code: MODULE.replace('function a(', 'function mine(') }),
      irNode('b', { code: 'return 2;', inline: true }),
    )
    useWorkflowStore.getState().renameNode('a', 'other')
    useWorkflowStore.getState().renameNode('b', 'raw')
    const [a, b] = useWorkflowStore.getState().nodes.map((n) => n.data.irNode)
    expect(a!.data.code).toContain('function mine(')
    expect(b!.data.code).toBe('return 2;')
    expect(b!.name).toBe('raw')
  })
})

describe('step functions follow their variable names', () => {
  const module = (fn: string) =>
    `export default async function ${fn}({ env, event, inputs, step, ctx }) {\n  return 1;\n}\n`
  const fnOf = (id: string) => /function (\w+)\(/.exec(String(dataOf(id).code))?.[1] ?? null

  it('renames the clone of a duplicated step after its own variable', () => {
    seed({ ...irNode('a'), name: 'x', data: { code: module('x') } })
    const [cloneId] = useWorkflowStore.getState().duplicateNodes(['a'])
    expect(fnOf('a')).toBe('x')
    expect(fnOf(cloneId!)).toBe('x_2')
  })

  it('moves the function of a step whose suffix a removal or a rename changed, and only then', () => {
    seed(
      { ...irNode('a'), name: 'x', data: { code: module('x') } },
      { ...irNode('b'), name: 'x', data: { code: module('x_2') } },
      { ...irNode('c'), name: 'y', data: { code: module('mine') } },
    )
    useWorkflowStore.getState().removeNode('a')
    expect(fnOf('b')).toBe('x')
    // A function the person named themselves stays theirs.
    expect(fnOf('c')).toBe('mine')
    useWorkflowStore.getState().renameNode('c', 'x')
    expect(fnOf('b')).toBe('x')
    expect(fnOf('c')).toBe('mine')
    useWorkflowStore.getState().renameNode('b', 'z')
    expect(fnOf('b')).toBe('z')
  })

  it('follows a deletion made through the canvas’s own change stream', () => {
    seed(
      { ...irNode('a'), name: 'x', data: { code: module('x') } },
      { ...irNode('b'), name: 'x', data: { code: module('x_2') } },
    )
    useWorkflowStore.getState().onNodesChange([{ type: 'remove', id: 'a' }])
    expect(fnOf('b')).toBe('x')
  })
})

describe('the Inline switch converts the code with it', () => {
  it('turns a module into statements and back, so the step never refuses to close', () => {
    seed({
      ...irNode('a'),
      name: 'a',
      data: {
        code: 'export default async function a({ env, event, inputs, step, ctx }) {\n  const { b } = inputs;\n  return b + inputs.c;\n}\n',
      },
    })
    useWorkflowStore.getState().updateNodeField('a', 'inline', true)
    expect(dataOf('a')).toEqual({ inline: true, code: 'return b + c;\n' })
    useWorkflowStore.getState().updateNodeField('a', 'inline', false)
    expect(dataOf('a').inline).toBe(false)
    expect(dataOf('a').code).toBe(
      'export default async function a({ env, event, inputs, step, ctx }) {\n  return b + c;\n}\n',
    )
  })
})
