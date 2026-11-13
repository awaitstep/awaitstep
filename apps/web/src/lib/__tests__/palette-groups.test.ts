import { describe, expect, it } from 'vitest'
import { isCustomNodeType, paletteGroups } from '../node-categories'

const node = (id: string, category: string) => ({ id, category })

describe('paletteGroups', () => {
  it('puts the Library custom nodes first, as one group whatever their category', () => {
    const groups = paletteGroups([
      node('step', 'Control Flow'),
      node('custom:a', 'CRM'),
      node('slack', 'Messaging'),
      node('custom:b', 'Utilities'),
    ])
    expect(groups.map((g) => [g.label, g.nodes.map((n) => n.id)])).toEqual([
      ['Custom nodes', ['custom:a', 'custom:b']],
      ['Core', ['step']],
      ['Communication', ['slack']],
    ])
  })

  it('has no Custom nodes group when there are none', () => {
    expect(paletteGroups([node('step', 'Control Flow')]).map((g) => g.key)).toEqual(['core'])
  })

  it('tells a Library node type from the rest', () => {
    expect(isCustomNodeType('custom:abc')).toBe(true)
    expect(isCustomNodeType('stripe')).toBe(false)
  })
})
