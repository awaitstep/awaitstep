export interface TokenCrypto {
  encrypt(plaintext: string): Promise<string>
  decrypt(ciphertext: string): Promise<string>
  /**
   * A keyed digest (hex HMAC-SHA256) of `input`, for fingerprints whose input
   * holds secret values: without the server key, a stored digest cannot be
   * checked against guesses.
   */
  digest(input: string): Promise<string>
}
