import type { TokenCrypto } from '@awaitstep/db'

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12
const AUTH_TAG_BIT_LENGTH = 128

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function createTokenCrypto(keyHex: string): Promise<TokenCrypto> {
  const keyBytes = hexToBytes(keyHex)
  if (keyBytes.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'],
  )

  return {
    async encrypt(plaintext: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
      const encoded = new TextEncoder().encode(plaintext)
      const cipherBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv, tagLength: AUTH_TAG_BIT_LENGTH },
        cryptoKey,
        encoded,
      )
      // Web Crypto appends the auth tag to the ciphertext
      const result = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength)
      result.set(iv)
      result.set(new Uint8Array(cipherBuffer), IV_LENGTH)
      return bytesToBase64(result)
    },

    async decrypt(ciphertext: string): Promise<string> {
      const data = base64ToBytes(ciphertext)
      const iv = data.slice(0, IV_LENGTH)
      const encrypted = data.slice(IV_LENGTH)
      const plainBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv, tagLength: AUTH_TAG_BIT_LENGTH },
        cryptoKey,
        encrypted,
      )
      return new TextDecoder().decode(plainBuffer)
    },
  }
}
