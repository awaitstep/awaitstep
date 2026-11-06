function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Two independent 32-bit FNV-1a passes over UTF-16 code units, hex-encoded
 * to 16 chars. Deterministic and dependency-free so it runs in the browser
 * as well as on the server; used for change detection — file ETags, the
 * version's graph hash, step source paths — not security.
 */
export function contentHash(input: string): string {
  const a = fnv1a32(input, 0x811c9dc5)
  const b = fnv1a32(input, 0xdeadbeef)
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}
