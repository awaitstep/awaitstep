import type { GeneratedBundle } from './types.js'

/**
 * Maps one workflow node to its generated identity: the `step.do` name it
 * emits under and (in bundle mode) the module file carrying its code. One
 * concept reused three ways — eject drift checking, per-step run telemetry,
 * and SDK step identity.
 */
export interface StepManifestEntry {
  nodeId: string
  /**
   * The node's `step.do` label — present only when the node's emitted code
   * actually contains `step.do("<label>"` (sleep/wait/sub-workflow nodes
   * emit other primitives or derived labels). Drift validation enforces the
   * label's survival only when set.
   */
  stepName?: string
  varName: string
  filePath?: string
}

export interface StepManifest {
  irHash: string
  steps: StepManifestEntry[]
}

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
 * preview path; used for drift baselines and change detection, not security.
 */
export function contentHash(input: string): string {
  const a = fnv1a32(input, 0x811c9dc5)
  const b = fnv1a32(input, 0xdeadbeef)
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/** Deterministic hash over a bundle's file paths and contents. */
export function bundleHash(bundle: GeneratedBundle): string {
  const canonical = [...bundle.files]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((f) => `${f.path}\u0000${f.source}`)
    .join('\u0001')
  return contentHash(canonical)
}
