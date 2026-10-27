import { describe, expect, it } from 'vitest'
import { moveCount } from '../move-count'

const wf = { kind: 'workflow' as const }
const fn = { kind: 'script' as const }

describe('moveCount', () => {
  it('names workflows and functions apart', () => {
    expect(moveCount([wf, wf])).toBe('2 workflows')
    expect(moveCount([fn])).toBe('1 function')
    expect(moveCount([wf, fn, fn])).toBe('1 workflow and 2 functions')
    expect(moveCount([])).toBe('0 workflows')
  })
})
