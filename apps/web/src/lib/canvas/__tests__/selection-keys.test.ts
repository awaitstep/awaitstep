import { describe, expect, it } from 'vitest'
import { clearSelectionChanges, escapeOutcome, selectAllChanges } from '../selection-keys'

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

describe('Esc on the canvas', () => {
  const none = {
    selectedSteps: 0,
    openStep: false,
    selectedEdge: false,
    canLeave: (): boolean => true,
  }

  it.each([
    ['nothing selected', none, 'decline'],
    ['steps selected', { ...none, selectedSteps: 2 }, 'clear'],
    ['an edge selected', { ...none, selectedEdge: true }, 'clear'],
    ['an open step that may be left', { ...none, openStep: true }, 'clear'],
    [
      'an open step with errors',
      { ...none, openStep: true, canLeave: (): boolean => false },
      'stay',
    ],
  ] as const)('with %s: %s', (_name, input, outcome) => {
    expect(escapeOutcome(input)).toBe(outcome)
  })
})
