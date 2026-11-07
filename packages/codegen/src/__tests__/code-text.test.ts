import { describe, expect, it } from 'vitest'
import { defaultFunctionHeader, maskNonCode, matchingBracket } from '../code-text.js'

describe('maskNonCode', () => {
  it('blanks comments and string contents, keeps code, length and newlines', () => {
    const code = 'const a = "export default"; // return\n/* return */ return `x ${a.b} y`;'
    const masked = maskNonCode(code)
    expect(masked.length).toBe(code.length)
    expect(masked).not.toContain('export default')
    expect(masked.match(/\breturn\b/g)).toHaveLength(1)
    // The template's expression is code and stays; its text does not.
    expect(masked).toContain('${a.b}')
    expect(masked).not.toContain(' y`')
    expect(masked.split('\n').length).toBe(code.split('\n').length)
  })

  it('handles escapes, an unterminated string, and a template nested in an expression', () => {
    expect(maskNonCode('"a\\"b" + c')).toBe('       + c')
    expect(maskNonCode('"open\nreturn 1')).toBe('     \nreturn 1')
    const nested = 'f(`a ${g(`b ${c}`)} d`)'
    const masked = maskNonCode(nested)
    expect(masked.length).toBe(nested.length)
    expect(masked).toContain('g(')
    expect(masked).toContain('${c}')
  })
})

describe('defaultFunctionHeader', () => {
  it('reads async, generator, named and anonymous declarations, and refuses other default exports', () => {
    expect(defaultFunctionHeader('export default async function fetch_user(')).toMatchObject({
      name: 'fetch_user',
      nameStart: 30,
      nameEnd: 40,
      paramsOpen: 40,
    })
    expect(defaultFunctionHeader('export default function* gen () {}')?.name).toBe('gen')
    expect(defaultFunctionHeader('export default function ({ env }) {}')?.name).toBeNull()
    expect(defaultFunctionHeader('export default async ({ env }) => 1')).toBeNull()
    expect(defaultFunctionHeader('export default handler')).toBeNull()
    expect(defaultFunctionHeader('return 1;')).toBeNull()
  })

  it('costs its length on a long run of whitespace after `function`, with no `(` to find', () => {
    // The regex it replaced backtracked cubically here: 4,000 spaces took 27 s.
    const text = 'export default function' + ' '.repeat(200_000) + '!'
    const started = Date.now()
    expect(defaultFunctionHeader(text)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})

describe('matchingBracket', () => {
  it('finds the closing bracket at the same depth, or -1', () => {
    expect(matchingBracket('({ a: { b } }, c)', 0, '(', ')')).toBe(16)
    expect(matchingBracket('({ a: { b } }, c)', 1, '{', '}')).toBe(12)
    expect(matchingBracket('{ open', 0, '{', '}')).toBe(-1)
  })
})
