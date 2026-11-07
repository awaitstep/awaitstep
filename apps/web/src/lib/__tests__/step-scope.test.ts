import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { stepScope } from '../step-scope'

function node(
  id: string,
  type = 'step',
  data: Record<string, unknown> = {},
  name = id,
): WorkflowNode {
  const base = type === 'step' ? { code: 'return 1;' } : {}
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { ...base, ...data },
  }
}

describe('stepScope', () => {
  it('lists the earlier top-level steps by their variable names, in run order', () => {
    const ir = {
      nodes: [node('a', 'step', {}, 'fetch user'), node('b'), node('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
      entryNodeId: 'a',
    }
    expect(stepScope(ir, 'c', 'workflow')).toEqual({
      varName: 'c',
      upstream: ['fetch_user', 'b'],
      bindings: [],
      status: 'ok',
      returned: false,
      exportKey: 'c',
    })
    expect(stepScope(ir, 'a', 'workflow').upstream).toEqual([])
  })

  it('lists what the containers around the step bind: a loop’s item and index, a catch arm’s error', () => {
    const ir = {
      nodes: [
        node('each', 'loop', { loopType: 'forEach', itemVar: 'row', collection: 'rows' }),
        node('body'),
        node('guard', 'try_catch'),
        node('risky'),
        node('fallback'),
      ],
      edges: [
        { id: 'e1', source: 'each', target: 'body', label: 'body' },
        { id: 'e2', source: 'each', target: 'guard', label: 'then' },
        { id: 'e3', source: 'guard', target: 'risky', label: 'try' },
        { id: 'e4', source: 'guard', target: 'fallback', label: 'catch' },
      ],
      entryNodeId: 'each',
    }
    expect(stepScope(ir, 'body', 'workflow').bindings).toEqual(['row', 'index'])
    expect(stepScope(ir, 'risky', 'workflow').bindings).toEqual([])
    expect(stepScope(ir, 'fallback', 'workflow').bindings).toEqual(['error'])
  })

  it('names only variables that hold a value: not a branch, not a step without a return', () => {
    const ir = {
      nodes: [
        node('gate', 'branch', { branches: [{ label: 'yes', condition: 'true' }] }),
        node('log', 'step', { code: 'console.log(1);' }),
        node('after'),
      ],
      edges: [
        { id: 'e1', source: 'gate', target: 'log', label: 'then' },
        { id: 'e2', source: 'log', target: 'after' },
      ],
      entryNodeId: 'gate',
    }
    expect(stepScope(ir, 'after', 'workflow').upstream).toEqual([])
  })

  it('leaves out a step inside a container unless a function returns it, which hoists it', () => {
    const ir = {
      nodes: [
        node('gate', 'branch', { branches: [{ label: 'yes', condition: 'true' }] }),
        node('inner'),
        node('shared', 'step', { export: true }),
        node('after'),
      ],
      edges: [
        { id: 'e1', source: 'gate', target: 'inner', label: 'yes' },
        { id: 'e2', source: 'inner', target: 'shared' },
        { id: 'e3', source: 'gate', target: 'after', label: 'then' },
      ],
      entryNodeId: 'gate',
    }
    expect(stepScope(ir, 'after', 'script').upstream).toEqual(['shared'])
    // A workflow hoists nothing, so the block keeps its child.
    expect(stepScope(ir, 'after', 'workflow').upstream).toEqual([])
  })

  it('reads the response key from the plan: the valid exportAs, else the variable name, deduped', () => {
    const ir = {
      nodes: [
        node('a', 'step', { export: true, exportAs: 'User' }, 'fetch user'),
        node('b', 'step', { export: true, exportAs: '2bad' }),
        node('c', 'step', { export: true, exportAs: 'User' }),
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
      entryNodeId: 'a',
    }
    expect(stepScope(ir, 'a', 'script')).toMatchObject({ returned: true, exportKey: 'User' })
    expect(stepScope(ir, 'b', 'script')).toMatchObject({ returned: true, exportKey: 'b' })
    expect(stepScope(ir, 'c', 'script')).toMatchObject({ returned: true, exportKey: 'User_2' })
  })

  it('says a switched-on step without a return is not returned, naming the key it would get', () => {
    const ir = {
      nodes: [node('a', 'step', { export: true, code: 'console.log(1);' })],
      edges: [],
      entryNodeId: 'a',
    }
    expect(stepScope(ir, 'a', 'script')).toMatchObject({ returned: false, exportKey: 'a' })
  })

  it('is not fooled by a cycle nothing reaches', () => {
    const ir = {
      nodes: [node('a'), node('b'), node('u', 'loop'), node('s')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'u', target: 's', label: 'body' },
        { id: 'e3', source: 's', target: 'u' },
      ],
      entryNodeId: 'a',
    }
    expect(stepScope(ir, 'b', 'script')).toMatchObject({ status: 'ok', upstream: ['a'] })
  })

  it('reports a defect as an error, not as a cycle', () => {
    const broken = { ...node('a'), data: undefined as unknown as Record<string, unknown> }
    const ir = {
      nodes: [broken, node('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      entryNodeId: 'a',
    }
    expect(stepScope(ir, 'b', 'script').status).toBe('error')
  })

  it('never throws on a cycle: it says so and lists nothing', () => {
    const ir = {
      nodes: [node('a'), node('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
      entryNodeId: 'a',
    }
    expect(stepScope(ir, 'b', 'workflow')).toEqual({
      varName: 'b',
      upstream: [],
      bindings: [],
      status: 'cycle',
      returned: false,
      exportKey: 'b',
    })
  })
})
