import { describe, it, expect } from 'vitest'
import { splitEnvVars } from '../env.js'

describe('splitEnvVars', () => {
  it('splits vars and secrets', () => {
    const result = splitEnvVars({
      API_URL: { value: 'https://example.com', isSecret: false },
      SECRET_KEY: { value: 's3cret', isSecret: true },
    })
    expect(result.vars).toEqual({ API_URL: 'https://example.com' })
    expect(result.secrets).toEqual({ SECRET_KEY: 's3cret' })
  })

  it('excludes _BINDING_ID entries', () => {
    const result = splitEnvVars({
      API_URL: { value: 'https://example.com', isSecret: false },
      KV_CACHE_BINDING_ID: { value: 'abc123', isSecret: false },
      DB_MAIN_BINDING_ID: { value: 'def456', isSecret: false },
    })
    expect(result.vars).toEqual({ API_URL: 'https://example.com' })
    expect(result.secrets).toEqual({})
  })

  it('returns empty objects when all entries are binding IDs', () => {
    const result = splitEnvVars({
      KV_CACHE_BINDING_ID: { value: 'abc123', isSecret: false },
    })
    expect(result.vars).toEqual({})
    expect(result.secrets).toEqual({})
  })

  it('returns empty objects for empty input', () => {
    const result = splitEnvVars({})
    expect(result.vars).toEqual({})
    expect(result.secrets).toEqual({})
  })
})
