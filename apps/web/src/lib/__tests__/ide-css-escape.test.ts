import { describe, expect, it } from 'vitest'
import { escapeCss } from '../ide/css-escape'

describe('escapeCss', () => {
  it('leaves plain identifiers alone', () => {
    expect(escapeCss('node_1-a')).toBe('node_1-a')
  })

  it('hex-escapes quotes, brackets, spaces and backslashes', () => {
    expect(escapeCss('a"b]c d\\')).toBe('a\\22 b\\5d c\\20 d\\5c ')
  })

  it('hex-escapes every line break and control character', () => {
    expect(escapeCss('\r\f\n\0')).toBe('\\d \\c \\a \\0 ')
  })

  it('escapes a leading digit, a dash then digit, and a lone dash', () => {
    expect(escapeCss('1a')).toBe('\\31 a')
    expect(escapeCss('-1')).toBe('-\\31 ')
    expect(escapeCss('-')).toBe('\\2d ')
  })

  it('escapes astral characters as one code point and a lone surrogate on its own', () => {
    expect(escapeCss('\u{1F600}')).toBe('\\1f600 ')
    expect(escapeCss('\ud800')).toBe('\\d800 ')
  })
})
