import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ZOD_JITLESS_SCRIPT } from '../zod-jitless'

describe('ZOD_JITLESS_SCRIPT', () => {
  it('turns on the jitless config Zod itself reads, so no schema probes for eval', () => {
    expect(z.config().jitless).not.toBe(true)
    // Test-only: run the head script as the page would.
    new Function(ZOD_JITLESS_SCRIPT)()
    expect(z.config().jitless).toBe(true)
    z.config({ jitless: false })
  })
})
