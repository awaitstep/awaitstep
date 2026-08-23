import { describe, it, expect } from 'vitest'
import {
  BUILTIN_NODE_TYPE_LIST,
  BUILTIN_NODE_TYPES,
  isBuiltinNodeType,
  isBuiltinNode,
  isNodeOfType,
  nodeDataOf,
  IR_VERSION,
} from '../types.js'
import type { WorkflowNode } from '../types.js'
import { bundledNodeDefinitions } from '../bundled-nodes/index.js'

function makeNode(type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: 'n1',
    type,
    name: 'Node',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

describe('BUILTIN_NODE_TYPES', () => {
  it('matches the bundled node definitions exactly', () => {
    const definedTypes = bundledNodeDefinitions.map((d) => d.id).sort()
    expect([...BUILTIN_NODE_TYPE_LIST].sort()).toEqual(definedTypes)
  })

  it('includes sub_script', () => {
    expect(BUILTIN_NODE_TYPES.has('sub_script')).toBe(true)
  })

  it('has 13 builtin types', () => {
    expect(BUILTIN_NODE_TYPE_LIST).toHaveLength(13)
  })
})

describe('type guards', () => {
  it('isBuiltinNodeType accepts builtins and rejects custom types', () => {
    expect(isBuiltinNodeType('step')).toBe(true)
    expect(isBuiltinNodeType('sub_script')).toBe(true)
    expect(isBuiltinNodeType('google-gemini')).toBe(false)
  })

  it('isBuiltinNode narrows on the node type', () => {
    expect(isBuiltinNode(makeNode('loop'))).toBe(true)
    expect(isBuiltinNode(makeNode('stripe'))).toBe(false)
  })

  it('isNodeOfType narrows to the specific builtin', () => {
    const node = makeNode('step', { code: 'return 1;' })
    expect(isNodeOfType(node, 'step')).toBe(true)
    expect(isNodeOfType(node, 'sleep')).toBe(false)
    if (isNodeOfType(node, 'step')) {
      expect(node.data.code).toBe('return 1;')
    }
  })

  it('nodeDataOf returns typed data only for matching types', () => {
    const node = makeNode('loop', { loopType: 'times', count: 3 })
    expect(nodeDataOf(node, 'loop')?.count).toBe(3)
    expect(nodeDataOf(node, 'branch')).toBeUndefined()
  })
})

describe('IR_VERSION', () => {
  it('is 2', () => {
    expect(IR_VERSION).toBe(2)
  })
})
