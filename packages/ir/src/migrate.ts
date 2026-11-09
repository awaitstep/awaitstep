import { IR_VERSION } from './types.js'

/**
 * Lazily migrates a raw IR document to the current {@link IR_VERSION}.
 *
 * v3 removes the workflow trigger block (schedules live in the provider's
 * deployment config; a script's `kind` is its HTTP entry) and renames v2
 * `runtime.bindings` to provider-scoped `runtime.resources`. v1 documents
 * still carry an annotation `triggerCode`, which is retained until the
 * project is converted to handler modules.
 */
export function migrateArtifact(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw

  const doc = raw as Record<string, unknown>
  const runtime =
    doc.runtime !== null && typeof doc.runtime === 'object' && !Array.isArray(doc.runtime)
      ? (doc.runtime as Record<string, unknown>)
      : undefined
  const hasBindings = runtime !== undefined && Object.hasOwn(runtime, 'bindings')
  const legacyBindings = runtime?.bindings
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : undefined
  const needsWaitTimeout = nodes?.some((node) => {
    if (node === null || typeof node !== 'object') return false
    const value = node as Record<string, unknown>
    if (value.type !== 'wait_for_event') return false
    const data = value.data
    return (
      data === null ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      (data as Record<string, unknown>).timeout === undefined ||
      (data as Record<string, unknown>).timeout === null ||
      (data as Record<string, unknown>).timeout === ''
    )
  })

  if (doc.irVersion === IR_VERSION && !('trigger' in doc) && !hasBindings && !needsWaitTimeout) {
    return raw
  }

  const { trigger: _trigger, ...rest } = doc
  if (nodes && needsWaitTimeout) {
    rest.nodes = nodes.map((node) => {
      if (node === null || typeof node !== 'object') return node
      const value = node as Record<string, unknown>
      if (value.type !== 'wait_for_event') return node
      const data =
        value.data !== null && typeof value.data === 'object' && !Array.isArray(value.data)
          ? (value.data as Record<string, unknown>)
          : {}
      return { ...value, data: { ...data, timeout: data.timeout || '365 days' } }
    })
  }
  if (runtime) {
    const { bindings: _bindings, ...runtimeRest } = runtime
    const existing = Array.isArray(runtimeRest.resources) ? runtimeRest.resources : []
    const migrated = Array.isArray(legacyBindings)
      ? legacyBindings.map((binding) => {
          if (binding === null || typeof binding !== 'object' || Array.isArray(binding)) {
            return binding
          }
          const value = binding as Record<string, unknown>
          const { type, ...fields } = value
          return {
            ...fields,
            ...(value.kind === undefined && type !== undefined && { kind: type }),
          }
        })
      : []
    const resources = [...existing]
    const seen = new Set(
      resources.map((resource) => {
        const value = resource as Record<string, unknown>
        return `${String(value.name)}:${String(value.kind)}`
      }),
    )
    for (const resource of migrated) {
      if (resource === null || typeof resource !== 'object' || Array.isArray(resource)) {
        resources.push(resource)
        continue
      }
      const value = resource as Record<string, unknown>
      const key = `${String(value.name)}:${String(value.kind)}`
      if (seen.has(key)) continue
      seen.add(key)
      resources.push(resource)
    }
    rest.runtime = {
      ...runtimeRest,
      ...(resources.length > 0 && { resources }),
    }
  }

  return { ...rest, irVersion: IR_VERSION }
}
