import { describe, it, expect } from 'vitest'
import { generateBreak, enterLoop, exitLoop } from '../../../codegen/generators/break.js'
import type { WorkflowNode } from '@awaitstep/ir'

const V = '1.0.0'
const P = 'cloudflare'

function exitNode(condition?: string): WorkflowNode {
  return {
    id: 'break-1',
    type: 'break',
    name: 'Exit',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: condition !== undefined ? { condition } : {},
  }
}

describe('generateBreak', () => {
  describe('outside loop (return)', () => {
    it('generates unconditional return', () => {
      expect(generateBreak(exitNode())).toBe('return;')
    })

    it('generates unconditional return for empty condition', () => {
      expect(generateBreak(exitNode(''))).toBe('return;')
    })

    it('generates conditional return', () => {
      const code = generateBreak(exitNode('result.failed'))
      expect(code).toBe('if (result.failed) return;')
    })
  })

  describe('inside loop (break)', () => {
    it('generates unconditional break', () => {
      enterLoop()
      expect(generateBreak(exitNode())).toBe('break;')
      exitLoop()
    })

    it('generates conditional break', () => {
      enterLoop()
      const code = generateBreak(exitNode('poll_result.status === "complete"'))
      expect(code).toBe('if (poll_result.status === "complete") break;')
      exitLoop()
    })

    it('tracks nested loop depth', () => {
      enterLoop()
      enterLoop()
      expect(generateBreak(exitNode())).toBe('break;')
      exitLoop()
      expect(generateBreak(exitNode())).toBe('break;')
      exitLoop()
      expect(generateBreak(exitNode())).toBe('return;')
    })
  })
})
