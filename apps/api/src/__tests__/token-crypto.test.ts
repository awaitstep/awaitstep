import { describe, it, expect } from 'vitest'
import { createTokenCrypto } from '../lib/token-crypto.js'

function randomKeyHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('createTokenCrypto', () => {
  it('round-trips a token through encrypt/decrypt', async () => {
    const tc = await createTokenCrypto(randomKeyHex())
    const token = 'cf_api_token_abc123xyz'
    const encrypted = await tc.encrypt(token)
    expect(encrypted).not.toBe(token)
    expect(await tc.decrypt(encrypted)).toBe(token)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const tc = await createTokenCrypto(randomKeyHex())
    const token = 'same-token'
    const a = await tc.encrypt(token)
    const b = await tc.encrypt(token)
    expect(a).not.toBe(b)
  })

  it('fails to decrypt with a different key', async () => {
    const tc1 = await createTokenCrypto(randomKeyHex())
    const tc2 = await createTokenCrypto(randomKeyHex())
    const encrypted = await tc1.encrypt('secret')
    await expect(tc2.decrypt(encrypted)).rejects.toThrow()
  })

  it('rejects keys that are not 32 bytes', async () => {
    await expect(createTokenCrypto('abcd')).rejects.toThrow('64-character hex string')
  })

  it('handles empty string', async () => {
    const tc = await createTokenCrypto(randomKeyHex())
    expect(await tc.decrypt(await tc.encrypt(''))).toBe('')
  })

  it('handles unicode tokens', async () => {
    const tc = await createTokenCrypto(randomKeyHex())
    const token = 'tökën-with-émojis-🔑'
    expect(await tc.decrypt(await tc.encrypt(token))).toBe(token)
  })
})
