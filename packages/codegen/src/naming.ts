const SAFE_LABEL = /^[A-Za-z0-9_-]+$/

/**
 * Deterministic durable-step label for a node: the node id itself. Node ids
 * are stable across renames, so run telemetry and SDK step identity join on
 * one scheme — a canvas rename never orphans step history or invalidates
 * `restart from` targets. Human-readable names are a display concern:
 * consumers map the label back to the node via the step manifest.
 */
export function stepLabel(node: { id: string }): string {
  return SAFE_LABEL.test(node.id) ? node.id : sanitizeStepLabel(node.id)
}

/**
 * Collapse an arbitrary string (an SDK-authored label, a file:line fallback)
 * to the conservative label charset shared with node ids.
 */
export function sanitizeStepLabel(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'step'
}

/**
 * Label for a node that emits more than one durable step (e.g. a
 * sub-workflow's create + await pair).
 */
export function derivedStepLabel(node: { id: string }, suffix: string): string {
  return `${stepLabel(node)}--${sanitizeStepLabel(suffix)}`
}
