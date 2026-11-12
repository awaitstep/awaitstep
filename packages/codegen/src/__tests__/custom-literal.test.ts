import { describe, expect, it } from 'vitest'
import { toJsLiteral } from '../graph/generators/custom.js'

describe('toJsLiteral', () => {
  it('escapes backslashes in template-literal values', () => {
    expect(toJsLiteral(String.raw`C:\tmp\${x}`)).toBe('`C:\\\\tmp\\\\${x}`')
  })
})
