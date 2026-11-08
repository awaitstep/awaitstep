import { contentHash } from '@awaitstep/codegen'
import { migrateArtifact } from '@awaitstep/ir'

/** JSON with every object's keys sorted, so equal documents read equal however they were written. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    // No prototype, so a key spelled `__proto__` is kept as data, not swallowed.
    const out: Record<string, unknown> = Object.create(null)
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The part of an IR document the canvas owns — nodes, edges, node
 * code and settings — without what other writers rewrite on every save:
 * `metadata` comes from the workflow row, the `irVersion` stamp from
 * migration, and `runtime.files` / `triggerCode` / `dependencies` are the
 * project-file table's, folded in when a version is stored. A document that
 * is not an object is left as it is.
 */
export function graphOf(doc: unknown): unknown {
  if (!isPlainObject(doc)) return doc
  const { metadata: _metadata, irVersion: _irVersion, runtime, ...graph } = doc
  if (runtime === undefined) return graph
  if (!isPlainObject(runtime)) return { ...graph, runtime }
  const { files: _files, triggerCode: _triggerCode, dependencies: _dependencies, ...kept } = runtime
  return Object.keys(kept).length > 0 ? { ...graph, runtime: kept } : graph
}

/**
 * The precondition token a save carries: `contentHash` (the file ETag hash)
 * of the canonical graph of a stored IR text. Defined for every stored row —
 * one that does not parse hashes as text — so a workflow with a version
 * always has one, and a files-only commit or a metadata rewrite never moves
 * it.
 */
export function graphHash(irText: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(irText)
  } catch {
    return contentHash(irText)
  }
  return contentHash(canonicalJson(graphOf(migrateArtifact(parsed))))
}
