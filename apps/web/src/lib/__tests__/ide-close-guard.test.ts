import { describe, expect, it } from 'vitest'
import { guardClose } from '../ide/close-guard'

describe('guardClose', () => {
  it('lets clean tabs close without asking', () => {
    expect(guardClose(['a.ts', 'b.ts'], new Set())).toBeNull()
    expect(guardClose(['a.ts'], new Set(['other.ts']))).toBeNull()
  })

  it('asks once for a close that includes dirty tabs, naming only those', () => {
    const request = guardClose(['a.ts', 'b.ts', 'c.ts'], new Set(['c.ts', 'a.ts']))
    expect(request).toEqual({ paths: ['a.ts', 'b.ts', 'c.ts'], dirty: ['a.ts', 'c.ts'] })
  })

  it('asks when the single tab being closed is dirty', () => {
    expect(guardClose(['a.ts'], new Set(['a.ts']))).toEqual({ paths: ['a.ts'], dirty: ['a.ts'] })
  })
})
