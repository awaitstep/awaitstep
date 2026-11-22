import { BUILTIN_NODE_TYPE_LIST } from '@awaitstep/ir'
import { describe, expect, it } from 'vitest'
import registryIndex from '../../../../../registry/index.json'
import {
  BUILTIN_COPY,
  BUILTIN_NODES,
  categoriesOf,
  INTEGRATIONS,
  toIntegrations,
} from '../integrations'

describe('the integrations page data', () => {
  it('lists every node in the registry index', () => {
    expect(INTEGRATIONS.map((n) => n.id).sort()).toEqual(
      registryIndex.nodes.map((n) => n.id).sort(),
    )
  })

  it('has site copy for every built-in node, short and dash-free', () => {
    for (const id of BUILTIN_NODE_TYPE_LIST) {
      const copy = BUILTIN_COPY[id]
      expect(copy, id).toBeDefined()
      expect(copy.line.length, id).toBeLessThanOrEqual(60)
      expect(copy.line, id).not.toMatch(/[\u2013\u2014]/)
      for (const word of copy.name.split(' ').slice(1)) {
        expect(word === word.toLowerCase() || word === 'HTTP', `${id}: sentence case`).toBe(true)
      }
    }
  })

  it('lists every built-in node type', () => {
    expect(BUILTIN_NODES.map((n) => n.id).sort()).toEqual([...BUILTIN_NODE_TYPE_LIST].sort())
  })
})

describe('toIntegrations', () => {
  const nodes = [
    { id: 'zeta', name: 'Zeta', description: 'z', category: 'AI', tags: ['LLM'], latest: '1.0.0' },
    { id: 'alpha', name: 'Alpha', description: 'a', category: 'Email', latest: '2.1.0' },
  ]

  it('sorts by name and links each to its registry folder', () => {
    const out = toIntegrations(nodes)
    expect(out.map((n) => n.id)).toEqual(['alpha', 'zeta'])
    expect(out[0].href).toBe(
      'https://github.com/awaitstep/awaitstep/tree/main/registry/nodes/alpha',
    )
    expect(out[0].version).toBe('2.1.0')
  })

  it('makes keywords from the name, category and tags, lower-cased', () => {
    expect(toIntegrations(nodes)[1].keywords).toBe('zeta ai llm')
  })
})

describe('categoriesOf', () => {
  it('orders categories by how many items use them, then A to Z', () => {
    const items = [
      { category: 'Email' },
      { category: 'AI' },
      { category: 'AI' },
      { category: 'CRM' },
    ]
    expect(categoriesOf(items)).toEqual(['AI', 'CRM', 'Email'])
  })
})
