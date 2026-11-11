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
  /**
   * The key this node's value is returned under from a function's graph
   * (`graph.<exportKey>`); present only for a node that is returned.
   */
  exportKey?: string
  varName: string
  filePath?: string
}

export interface StepManifest {
  irHash: string
  steps: StepManifestEntry[]
}

export { contentHash } from '@awaitstep/ir'

const LOOP_SUFFIX = / \[\d+\]$/
const DERIVED_SEPARATOR = '--'
/** The occurrence count a provider appends to a step's name (`<label>-1`, `-2`, …). */
const OCCURRENCE_SUFFIX = /-\d+$/

/** A label with the provider's occurrence count dropped, then the loop iteration. */
function bareLabel(label: string): string {
  return label.replace(OCCURRENCE_SUFFIX, '').replace(LOOP_SUFFIX, '')
}

/**
 * The node id a generated step label was derived from: strips the
 * provider's occurrence count (`<id>-1`), the loop iteration suffix
 * (`<id> [3]`) and the derived multi-step suffix (`<id>--create`). Container
 * children run under their bare node id as label, so this is also how
 * consumers attribute labels the manifest does not list.
 */
export function stepLabelBase(label: string): string {
  const base = bareLabel(label)
  const sep = base.indexOf(DERIVED_SEPARATOR)
  return sep > 0 ? base.slice(0, sep) : base
}

/**
 * Maps a provider-reported step label back to its node id via the manifest.
 * Handles the label transforms: the provider's occurrence count
 * (`<label>-1`), loop iteration suffixes (`<label> [<i>]`) and derived
 * multi-step labels (`<nodeId>--<suffix>`); the label as reported is tried
 * first, as a node id may itself end in `-<digits>`. An entry with no step
 * name of its own (a wait, a container child) is found by its node id. A
 * coalesced group's single record maps to its leader; members link to the
 * leader through their entries' `coalescedInto`. Returns undefined for
 * labels the manifest can't claim — callers keep the step with no node
 * attribution rather than guessing.
 */
export function resolveStepNode(manifest: StepManifest, label: string): string | undefined {
  for (const candidate of [label.replace(LOOP_SUFFIX, ''), bareLabel(label)]) {
    const byLabel = manifest.steps.find((s) => s.stepName === candidate)
    if (byLabel) return byLabel.nodeId
  }
  // The node id: with the occurrence count dropped, or — for a node id that ends in
  // `-<digits>` and a provider that adds no count — with only the other suffixes dropped.
  for (const base of [stepLabelBase(label), derivedBase(label.replace(LOOP_SUFFIX, ''))]) {
    const byId = manifest.steps.find((s) => s.nodeId === base)
    if (byId) return byId.nodeId
  }
  return undefined
}

function derivedBase(label: string): string {
  const sep = label.indexOf(DERIVED_SEPARATOR)
  return sep > 0 ? label.slice(0, sep) : label
}
