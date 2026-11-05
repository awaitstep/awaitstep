import { describe, expect, it } from 'vitest'
import { stepsKeyIntent } from '../ide/steps-keys'
import type { StepRow } from '../ide/step-order'

function row(nodeId: string, depth: number, parentId: string | null, container = false): StepRow {
  return { nodeId, depth, parentId, arm: null, container }
}

// a / b (container) / b1 / b2 / c
const rows = [
  row('a', 0, null),
  row('b', 0, null, true),
  row('b1', 1, 'b'),
  row('b2', 1, 'b'),
  row('c', 0, null),
]
const none = new Set<string>()

describe('stepsKeyIntent', () => {
  it('moves down and up between the rows showing', () => {
    expect(stepsKeyIntent(rows, none, 'a', 'ArrowDown')).toEqual({ type: 'focus', nodeId: 'b' })
    expect(stepsKeyIntent(rows, none, 'b', 'ArrowUp')).toEqual({ type: 'focus', nodeId: 'a' })
  })

  it('stops at either end', () => {
    expect(stepsKeyIntent(rows, none, 'c', 'ArrowDown')).toBeNull()
    expect(stepsKeyIntent(rows, none, 'a', 'ArrowUp')).toBeNull()
  })

  it('jumps to the first and last', () => {
    expect(stepsKeyIntent(rows, none, 'b1', 'Home')).toEqual({ type: 'focus', nodeId: 'a' })
    expect(stepsKeyIntent(rows, none, 'a', 'End')).toEqual({ type: 'focus', nodeId: 'c' })
  })

  it('folds an open container with left and unfolds a closed one with right', () => {
    expect(stepsKeyIntent(rows, none, 'b', 'ArrowLeft')).toEqual({ type: 'collapse', nodeId: 'b' })
    expect(stepsKeyIntent(rows, new Set(['b']), 'b', 'ArrowRight')).toEqual({
      type: 'expand',
      nodeId: 'b',
    })
  })

  it('moves into an open container with right, and out to it with left', () => {
    expect(stepsKeyIntent(rows, none, 'b', 'ArrowRight')).toEqual({ type: 'focus', nodeId: 'b1' })
    expect(stepsKeyIntent(rows, none, 'b2', 'ArrowLeft')).toEqual({ type: 'focus', nodeId: 'b' })
  })

  it('does nothing for left or right on a plain top-level step', () => {
    expect(stepsKeyIntent(rows, none, 'a', 'ArrowLeft')).toBeNull()
    expect(stepsKeyIntent(rows, none, 'a', 'ArrowRight')).toBeNull()
  })

  it('picks the step with Enter or Space, containers included', () => {
    expect(stepsKeyIntent(rows, none, 'a', 'Enter')).toEqual({ type: 'select', nodeId: 'a' })
    expect(stepsKeyIntent(rows, none, 'b', ' ')).toEqual({ type: 'select', nodeId: 'b' })
  })

  it('hands the keyboard back with Escape and ignores other keys', () => {
    expect(stepsKeyIntent(rows, none, 'a', 'Escape')).toEqual({ type: 'escape' })
    expect(stepsKeyIntent(rows, none, 'a', 'x')).toBeNull()
  })

  it('starts at the first row when nothing is focused', () => {
    expect(stepsKeyIntent(rows, none, null, 'ArrowDown')).toEqual({ type: 'focus', nodeId: 'a' })
  })
})
