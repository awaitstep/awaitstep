import { describe, expect, it } from 'vitest'
import { parseRunError } from '../parse-run-error'

describe('parseRunError', () => {
  it('passes plain strings through as the message and raw value', () => {
    expect(parseRunError('boom')).toEqual({ message: 'boom', raw: 'boom' })
  })

  it('parses a JSON-encoded error object string', () => {
    const encoded = JSON.stringify({ name: 'TypeError', message: 'x is not a function' })
    const result = parseRunError(encoded)
    expect(result.name).toBe('TypeError')
    expect(result.message).toBe('x is not a function')
  })

  it('extracts name, message, and stack from an error-shaped object', () => {
    const result = parseRunError({ name: 'Error', message: 'failed', stack: 'at line 1' })
    expect(result).toMatchObject({ name: 'Error', message: 'failed', stack: 'at line 1' })
    expect(result.raw).toContain('"failed"')
  })

  it('falls back to the raw JSON when an object has no message', () => {
    const result = parseRunError({ code: 500 })
    expect(result.message).toContain('500')
    expect(result.name).toBeUndefined()
  })

  it('stringifies non-object, non-string values', () => {
    expect(parseRunError(42)).toEqual({ message: '42', raw: '42' })
    expect(parseRunError(null).message).toBe('null')
  })

  it('keeps a JSON string that is not an object as a plain message', () => {
    expect(parseRunError('"quoted"')).toEqual({ message: '"quoted"', raw: '"quoted"' })
  })
})
