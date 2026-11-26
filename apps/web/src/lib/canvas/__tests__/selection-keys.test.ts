import { describe, expect, it } from 'vitest'
import { clearSelectionChanges, selectAllChanges } from '../selection-keys'

const nodes = [{ id: 'a', selected: true }, { id: 'b' }, { id: 'c', selected: false }]

describe('canvas selection keys', () => {
  it('selects only the steps not selected yet', () => {
    expect(selectAllChanges(nodes)).toEqual([
      { type: 'select', id: 'b', selected: true },
      { type: 'select', id: 'c', selected: true },
    ])
  })

  it.each([
    ['the selected steps', nodes, [{ type: 'select', id: 'a', selected: false }]],
    ['nothing when none is selected', [{ id: 'b' }], []],
  ])('clears %s', (_name, input, expected) => {
    expect(clearSelectionChanges(input)).toEqual(expected)
  })
})
