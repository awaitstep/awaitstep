import { describe, expect, it } from 'vitest'
import { SOURCE_MODES } from '@awaitstep/codegen'
import { describeEditability } from '../ide/editability'

describe('describeEditability', () => {
  it('tells canvas-owned source to eject rather than edit', () => {
    const generated = describeEditability('generated')
    expect(generated.readOnly).toBe(true)
    expect(generated.message).toMatch(/eject/i)
  })

  it('never tells already-ejected source to eject', () => {
    for (const mode of ['ejected', 'sdk'] as const) {
      const result = describeEditability(mode)
      expect(result.readOnly).toBe(true)
      expect(result.message).not.toMatch(/eject/i)
    }
  })

  it('covers every source mode the codegen contract declares', () => {
    for (const mode of SOURCE_MODES) {
      expect(describeEditability(mode)).toBeDefined()
    }
  })
})
