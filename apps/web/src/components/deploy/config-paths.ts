/**
 * Helpers for reading and writing dotted paths against a deployment-config
 * object, with boolean-parent materialization driven by the UI schema's
 * `defaultObject` hints.
 *
 * Background: some provider deployment configs (e.g. Cloudflare's
 * `observability`, `placement`) accept either a boolean shorthand or a full
 * object. The form lets users edit nested sub-fields like
 * `observability.logs.persist` even while the saved value is still the bare
 * boolean `true`. These helpers handle the read/write asymmetry so sub-field
 * edits transparently expand the parent into its canonical object form.
 */

export interface UiFieldLike {
  path: string
  defaultObject?: Record<string, unknown>
  visibleWhen?: { path: string; truthy: true }
  advanced?: boolean
}

export interface UiSchemaLike {
  groups: Array<{ fields: UiFieldLike[] }>
}

export type DefaultsByPath = Map<string, Record<string, unknown>>

export function buildDefaults(schema: UiSchemaLike): DefaultsByPath {
  const map: DefaultsByPath = new Map()
  for (const g of schema.groups) {
    for (const f of g.fields) {
      if (f.defaultObject) map.set(f.path, f.defaultObject)
    }
  }
  return map
}

/**
 * Read a dotted path against a config object. If an intermediate segment is a
 * boolean `true` and that segment's path is registered in `defaults`, the
 * function continues into the defaults object — so sub-fields display the
 * canonical defaults until the user touches them. Boolean `false`, `null`,
 * `undefined`, or non-object intermediate values short-circuit to `undefined`.
 */
export function readPath(
  config: Record<string, unknown>,
  path: string,
  defaults: DefaultsByPath,
): unknown {
  const parts = path.split('.')
  let cur: unknown = config
  let walked = ''
  for (const p of parts) {
    if (cur === true) {
      const def = defaults.get(walked)
      if (!def) return undefined
      cur = def
    }
    if (cur === false || cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
    walked = walked ? `${walked}.${p}` : p
  }
  return cur
}

/**
 * Write a dotted path immutably, materializing boolean-true intermediates via
 * `defaults` along the way so the user's previously-implicit sub-defaults are
 * preserved when the parent is expanded into object form.
 */
export function writePath(
  config: Record<string, unknown>,
  path: string,
  value: unknown,
  defaults: DefaultsByPath,
): Record<string, unknown> {
  const parts = path.split('.')
  if (parts.length === 1) return { ...config, [parts[0]]: value }

  const out: Record<string, unknown> = { ...config }
  let cur: Record<string, unknown> = out
  let walked = ''
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    walked = walked ? `${walked}.${p}` : p
    const existing = cur[p]
    let next: Record<string, unknown>
    if (existing === true) {
      const def = defaults.get(walked)
      next = def ? { ...def } : {}
    } else if (existing && typeof existing === 'object') {
      next = { ...(existing as Record<string, unknown>) }
    } else {
      next = {}
    }
    cur[p] = next
    cur = next
  }
  cur[parts[parts.length - 1]] = value
  return out
}

/** True when the field has no visibility predicate or the predicate is satisfied. */
export function isVisible(
  field: UiFieldLike,
  config: Record<string, unknown>,
  defaults: DefaultsByPath,
): boolean {
  if (!field.visibleWhen) return true
  const v = readPath(config, field.visibleWhen.path, defaults)
  return Boolean(v)
}
