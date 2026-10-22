/** Which durable step primitive a manifest entry's label belongs to. */
export type StepKind = 'do' | 'sleep' | 'waitForEvent'

/**
 * Maps one workflow node to its generated identity: the durable-step label
 * it emits under and (in bundle mode) the module file carrying its code. One
 * concept reused two ways — per-step run telemetry and SDK step identity.
 */
export interface StepManifestEntry {
  nodeId: string
  /**
   * The node's durable-step label — present only when the node's emitted
   * code actually carries it on a step primitive (sub-workflow nodes emit
   * derived labels instead). Run telemetry joins provider step records back
   * to nodes through it.
   */
  stepName?: string
  /** The primitive the label is attached to; present exactly when stepName is. */
  kind?: StepKind
  /**
   * For a coalesced group member: the leader node whose labeled step this
   * node's code runs inside. Run telemetry attributes the provider's single
   * step record for the leader's label to every member through this link.
   */
  coalescedInto?: string
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
 * preview path; used for change detection, not security.
 */
export function contentHash(input: string): string {
  const a = fnv1a32(input, 0x811c9dc5)
  const b = fnv1a32(input, 0xdeadbeef)
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

const LOOP_SUFFIX = / \[\d+\]$/
const DERIVED_SEPARATOR = '--'

/**
 * The node id a generated step label was derived from: strips the loop
 * iteration suffix (`<id> [3]`) and the derived multi-step suffix
 * (`<id>--create`). Container children run under their bare node id as
 * label, so this is also how consumers attribute labels the manifest does
 * not list.
 */
export function stepLabelBase(label: string): string {
  const base = label.replace(LOOP_SUFFIX, '')
  const sep = base.indexOf(DERIVED_SEPARATOR)
  return sep > 0 ? base.slice(0, sep) : base
}

/**
 * Maps a provider-reported step label back to its node id via the manifest.
 * Handles the two generated label transforms: loop iteration suffixes
 * (`<label> [<i>]`) and derived multi-step labels (`<nodeId>--<suffix>`).
 * A coalesced group's single record maps to its leader; members link to the
 * leader through their entries' `coalescedInto`. Returns undefined for
 * labels the manifest can't claim — callers keep the step with no node
 * attribution rather than guessing.
 */
export function resolveStepNode(manifest: StepManifest, label: string): string | undefined {
  const unsuffixed = label.replace(LOOP_SUFFIX, '')
  const byLabel = manifest.steps.find((s) => s.stepName === unsuffixed)
  if (byLabel) return byLabel.nodeId
  const base = stepLabelBase(label)
  if (base !== unsuffixed) {
    const byId = manifest.steps.find((s) => s.nodeId === base)
    if (byId) return byId.nodeId
  }
  return undefined
}
