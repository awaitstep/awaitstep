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

  if (doc.irVersion === IR_VERSION && !('trigger' in doc) && !hasBindings) {
    return raw
  }

  const { trigger: _trigger, ...rest } = doc
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
