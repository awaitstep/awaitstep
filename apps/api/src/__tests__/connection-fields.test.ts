import { describe, expect, it } from 'vitest'
import { credentialError } from '../lib/connection-fields.js'

describe('credentialError', () => {
  it('refuses an unknown provider rather than skipping the shape check', () => {
    expect(credentialError('constructor', {})).toEqual({
      field: 'provider',
      error: 'Unsupported provider: constructor',
    })
  })

  it('uses the registered provider validator', () => {
    expect(credentialError('cloudflare', { accountId: 'nope' })).toMatchObject({
      field: 'accountId',
    })
    expect(credentialError('cloudflare', { accountId: 'a'.repeat(32) })).toBeNull()
  })
})
