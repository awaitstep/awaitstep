import { migrateArtifact, validateArtifact, type ArtifactIR } from '@awaitstep/ir'

/** An exported workflow file, checked and ready to become an item. */
export interface ImportedFile {
  ir: ArtifactIR
  kind: 'workflow' | 'script'
  name: string
  description?: string
}

// The API refuses request bodies over 1 MB (`apps/api/src/lib/request-limits.ts`),
// so a larger export could never be saved; refuse it before reading it into the tab.
export const MAX_IMPORT_BYTES = 1024 * 1024

export const TOO_LARGE = 'That file is over 1 MB, too large to import.'

export const NOT_JSON = 'That file isn’t valid JSON. Pick a .json file exported from AwaitStep.'

// A broken export can fail on every node; the first few say what's wrong.
const SHOWN_ERRORS = 3

function nameFromFile(fileName: string): string {
  return fileName.replace(/(\.ir)?\.json$/i, '').trim()
}

/**
 * Reads an export (`ArtifactIR` JSON) the way the API will store it, so a bad
 * file is refused before anything is created. Throws an `Error` whose message
 * says why. The name is the export's, else the file's.
 */
export function parseImportFile(content: string, fileName: string): ImportedFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(NOT_JSON)
  }
  // As the API does on save: an older export is brought up to date first.
  const result = validateArtifact(migrateArtifact(parsed))
  if (!result.ok) {
    const shown = result.errors
      .slice(0, SHOWN_ERRORS)
      .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
    const more = result.errors.length - shown.length
    throw new Error(
      `That file isn’t a workflow export: ${shown.join('; ')}${more > 0 ? ` (and ${more} more)` : ''}.`,
    )
  }
  const ir = result.value
  const description = ir.metadata.description?.trim()
  return {
    ir,
    kind: ir.kind === 'script' ? 'script' : 'workflow',
    name: ir.metadata.name.trim() || nameFromFile(fileName) || 'Imported workflow',
    ...(description && { description }),
  }
}
