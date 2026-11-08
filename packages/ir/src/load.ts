import type { ArtifactIR, Result, ValidationError } from './types.js'
import { artifactIRSchema } from './schema.js'
import { migrateArtifact } from './migrate.js'

/**
 * The single entry point for loading a stored IR document: JSON-parse (when
 * given a string), migrate to the current version, then schema-validate.
 *
 * Deliberately schema-only — structural validation (cycles, reachability,
 * per-type data rules) stays in validateArtifact/validateNodeData so that
 * editable drafts always load; run full validation before publish or deploy.
 */
export function loadArtifact(input: string | unknown): Result<ArtifactIR, ValidationError[]> {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, errors: [{ path: '', message: `Invalid JSON: ${message}` }] }
    }
  }

  let migrated: unknown
  try {
    migrated = migrateArtifact(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, errors: [{ path: '', message: `Invalid IR: ${message}` }] }
  }
  const result = artifactIRSchema.safeParse(migrated)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }

  return { ok: true, value: result.data as ArtifactIR }
}
