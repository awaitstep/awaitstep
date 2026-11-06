import { contentHash } from './content-hash.js'
import {
  STEP_SOURCE_DIR,
  isGeneratedPath,
  isReservedToolchainPath,
  isSafePathSegment,
} from './project-files.js'

/**
 * An id kept as the file stem as it is: the canvas's own alphabet
 * (`[a-z0-9_]`, plus `-`), no dots — with the extension appended a dot could
 * spell `..` or `.d.ts` — and no uppercase, so two ids a case-insensitive
 * disk would confuse never both keep their spelling.
 */
const VERBATIM_ID = /^[a-z0-9_][a-z0-9_-]*$/
const MAX_VERBATIM_ID_LENGTH = 64
const MAX_STEM_LENGTH = 48
const SUFFIX_LENGTH = 6

/**
 * The code workspace's path for a step node's body: `steps/<id>.ts`. A
 * function of the id alone, so renaming the node never moves the file and
 * the canvas and Code agree on it without a lookup. Ids made on the canvas
 * (12 lowercase chars) keep their spelling; any other id — an imported
 * document's — is rewritten to a safe stem with a hash of the original
 * appended, so two ids that rewrite alike still get two paths. A stem the
 * deploy would read as its own (`wrangler`) is rewritten too.
 */
export function stepSourcePath(nodeId: string): string {
  if (VERBATIM_ID.test(nodeId) && nodeId.length <= MAX_VERBATIM_ID_LENGTH) {
    const path = `${STEP_SOURCE_DIR}/${nodeId}.ts`
    if (!isGeneratedPath(path) && !isReservedToolchainPath(path)) return path
  }
  return `${STEP_SOURCE_DIR}/${safeStem(nodeId)}-${contentHash(nodeId).slice(0, SUFFIX_LENGTH)}.ts`
}

// Dots go too, so the stem can never spell `..` or end in `.d`.
function safeStem(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_STEM_LENGTH)
  return isSafePathSegment(cleaned) && /^[A-Za-z0-9_]/.test(cleaned) ? cleaned : `_${cleaned}`
}
