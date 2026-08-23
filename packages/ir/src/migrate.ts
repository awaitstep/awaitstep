import { IR_VERSION } from './types.js'

/**
 * Lazily migrates a raw IR document to the current {@link IR_VERSION}.
 *
 * Pure and structural: operates on the parsed JSON before schema validation
 * and never mutates its input. v1 → v2 is a version stamp — the node/edge
 * shape is unchanged; typed node data (v2) is a contract layered on the same
 * storage format. Callers persist migrated documents only on the next save;
 * stored rows are never rewritten in place.
 */
export function migrateArtifact(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw

  const doc = raw as Record<string, unknown>

  // Script IRs persisted before the trigger requirement existed have
  // kind:'script' with no trigger — default to HTTP (the only script trigger
  // v1 supported) so they keep loading.
  const needsScriptTrigger = doc.kind === 'script' && doc.trigger == null

  if (doc.irVersion === IR_VERSION && !needsScriptTrigger) return raw

  return {
    ...doc,
    ...(needsScriptTrigger && { trigger: { type: 'http' } }),
    irVersion: IR_VERSION,
  }
}
