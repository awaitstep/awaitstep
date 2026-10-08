import type { GeneratedBundle } from './types.js'

/** Which durable step primitive a manifest entry's label belongs to. */
export type StepKind = 'do' | 'sleep' | 'waitForEvent'

/**
 * Maps one workflow node to its generated identity: the durable-step label
 * it emits under and (in bundle mode) the module file carrying its code. One
 * concept reused three ways — eject drift checking, per-step run telemetry,
 * and SDK step identity.
 */
export interface StepManifestEntry {
  nodeId: string
  /**
   * The node's durable-step label — present only when the node's emitted
   * code actually carries it on a step primitive (sub-workflow nodes emit
   * derived labels instead). Drift validation enforces the label's survival
   * only when set; run telemetry joins provider step records back to nodes
   * through it.
   */
  stepName?: string
  /** The primitive the label is attached to; present exactly when stepName is. */
  kind?: StepKind
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

const LOOP_SUFFIX = / \[\d+\]$/
const DERIVED_SEPARATOR = '--'

/**
 * Maps a provider-reported step label back to its node id via the manifest.
 * Handles the two generated label transforms: loop iteration suffixes
 * (`<label> [<i>]`) and derived multi-step labels (`<nodeId>--<suffix>`).
 * Returns undefined for labels the manifest can't claim — callers keep the
 * step with no node attribution rather than guessing.
 */
export function resolveStepNode(manifest: StepManifest, label: string): string | undefined {
  const base = label.replace(LOOP_SUFFIX, '')
  const byLabel = manifest.steps.find((s) => s.stepName === base)
  if (byLabel) return byLabel.nodeId
  const sep = base.indexOf(DERIVED_SEPARATOR)
  if (sep > 0) {
    const prefix = base.slice(0, sep)
    const byId = manifest.steps.find((s) => s.nodeId === prefix)
    if (byId) return byId.nodeId
  }
  return undefined
}

/** Deterministic hash over a bundle's file paths and contents. */
export function bundleHash(bundle: GeneratedBundle): string {
  const canonical = [...bundle.files]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((f) => `${f.path}\u0000${f.source}`)
    .join('\u0001')
  return contentHash(canonical)
}
