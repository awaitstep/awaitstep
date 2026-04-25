import { describe, it, expect } from 'vitest'
import {
  buildSecretsBulkJson,
  redactSensitive,
  safeFilename,
  validateSecretKey,
  SECRETS_BULK_FILENAME,
} from '../deploy/deployer.js'

describe('validateSecretKey', () => {
  it('accepts env-var style identifiers', () => {
    expect(validateSecretKey('AWS_ACCESS_KEY_ID')).toBe(true)
    expect(validateSecretKey('_internal')).toBe(true)
    expect(validateSecretKey('a1')).toBe(true)
  })

  it('rejects keys starting with a digit or containing special chars', () => {
    expect(validateSecretKey('1bad')).toBe(false)
    expect(validateSecretKey('with space')).toBe(false)
    expect(validateSecretKey('a;rm -rf /')).toBe(false)
    expect(validateSecretKey('')).toBe(false)
  })
})

describe('redactSensitive', () => {
  it('replaces 30+ char alphanumeric runs', () => {
    const long = 'a'.repeat(40)
    expect(redactSensitive(`token=${long} done`)).toBe('token=[REDACTED] done')
  })

  it('leaves short strings untouched', () => {
    expect(redactSensitive('abc xyz')).toBe('abc xyz')
  })
})

describe('safeFilename', () => {
  it('returns the basename, stripping directory components', () => {
    expect(safeFilename('worker.js')).toBe('worker.js')
    expect(safeFilename('/a/b/worker.js')).toBe('worker.js')
    expect(safeFilename('../etc/passwd')).toBe('passwd')
  })

  it('rejects empty or pure-`..` names', () => {
    expect(() => safeFilename('')).toThrow('Invalid artifact filename')
    expect(() => safeFilename('..')).toThrow('Invalid artifact filename')
    expect(() => safeFilename('foo..bar')).toThrow('Invalid artifact filename')
  })
})

describe('buildSecretsBulkJson', () => {
  it('returns null json when no secrets are provided', () => {
    expect(buildSecretsBulkJson(undefined)).toEqual({ json: null, valid: [], skipped: [] })
    expect(buildSecretsBulkJson({})).toEqual({ json: null, valid: [], skipped: [] })
  })

  it('serializes valid secrets as JSON', () => {
    const result = buildSecretsBulkJson({ AWS_ACCESS_KEY_ID: 'AKIA', AWS_SECRET: 's3cr3t' })
    expect(result.valid).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET'])
    expect(result.skipped).toEqual([])
    expect(JSON.parse(result.json!)).toEqual({
      AWS_ACCESS_KEY_ID: 'AKIA',
      AWS_SECRET: 's3cr3t',
    })
  })

  it('skips invalid keys but keeps valid ones', () => {
    const result = buildSecretsBulkJson({ GOOD: 'v', '1bad': 'x', 'with space': 'y' })
    expect(result.valid).toEqual(['GOOD'])
    expect(result.skipped).toEqual(['1bad', 'with space'])
    expect(JSON.parse(result.json!)).toEqual({ GOOD: 'v' })
  })

  it('returns null json when every key is invalid', () => {
    const result = buildSecretsBulkJson({ '1bad': 'x' })
    expect(result.json).toBeNull()
    expect(result.valid).toEqual([])
    expect(result.skipped).toEqual(['1bad'])
  })

  it('preserves values containing special characters via JSON encoding', () => {
    const result = buildSecretsBulkJson({ SECRET: 'line1\nline2\t"quoted"' })
    expect(JSON.parse(result.json!)).toEqual({ SECRET: 'line1\nline2\t"quoted"' })
  })
})

describe('SECRETS_BULK_FILENAME', () => {
  it('is a dot-prefixed filename so it sorts away from worker code', () => {
    expect(SECRETS_BULK_FILENAME.startsWith('.')).toBe(true)
    expect(SECRETS_BULK_FILENAME.endsWith('.json')).toBe(true)
  })
})
