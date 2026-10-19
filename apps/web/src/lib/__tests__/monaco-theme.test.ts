import { describe, it, expect } from 'vitest'
import { monacoTheme } from '../monaco/theme'

describe('monacoTheme', () => {
  it('maps each app theme to a built-in Monaco theme', () => {
    expect(monacoTheme('dark')).toBe('vs-dark')
    expect(monacoTheme('light')).toBe('vs')
  })

  it('never leaves an editor on the opposite theme', () => {
    // Monaco applies a theme globally, so the two must differ — a mapping that
    // collapsed to one value would silently pin every editor to it.
    expect(monacoTheme('dark')).not.toBe(monacoTheme('light'))
  })
})
