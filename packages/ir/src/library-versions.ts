// Publishing a library item: which version it becomes, and whether a custom
// node's manifest is one the palette and codegen can use.

import type { z } from 'zod'
import { nodeDefinitionSchema } from './node-bundle.js'
import type { NodeDefinition } from './node-definition.js'
import type { ValidationError } from './types.js'
import { compareLibraryVersions, isLibraryVersion, nextPatchVersion } from './library.js'

export type LibraryVersionChoice =
  | { ok: true; version: string; bumpedFrom?: string }
  /** `lower`: a version at or below the latest; `invalid`: none can be read. */
  | { ok: false; code: 'lower' | 'invalid'; message: string }

/**
 * A module publishes the version its `package.json` declares. Declaring the
 * latest published version again publishes the next patch instead (the
 * caller writes it back); a lower one is refused.
 */
export function moduleVersionChoice(
  declared: string | undefined,
  latest: string | null,
): LibraryVersionChoice {
  if (declared === undefined) {
    return { ok: false, code: 'invalid', message: 'package.json needs a "version" such as 1.0.0' }
  }
  if (!isLibraryVersion(declared)) {
    return {
      ok: false,
      code: 'invalid',
      message: `package.json version "${declared}" must be major.minor.patch, such as 1.0.0`,
    }
  }
  if (latest === null) return { ok: true, version: declared }
  const order = compareLibraryVersions(declared, latest)
  if (order === 0) return { ok: true, version: nextPatchVersion(latest), bumpedFrom: declared }
  if (order < 0) {
    return {
      ok: false,
      code: 'lower',
      message: `Version ${declared} is lower than the latest published version ${latest}`,
    }
  }
  return { ok: true, version: declared }
}

/** A node publishes its one unpublished version folder, which must be above the latest. */
export function nodeVersionChoice(
  draftFolders: readonly string[],
  latest: string | null,
): LibraryVersionChoice {
  if (draftFolders.length === 0) {
    return {
      ok: false,
      code: 'invalid',
      message: 'Nothing to publish: start a new version from the latest one first',
    }
  }
  if (draftFolders.length > 1) {
    return {
      ok: false,
      code: 'invalid',
      message: `Only one unpublished version at a time (found ${draftFolders.join(', ')})`,
    }
  }
  const version = draftFolders[0]!
  if (latest !== null && compareLibraryVersions(version, latest) <= 0) {
    return {
      ok: false,
      code: 'lower',
      message: `Version ${version} is not above the latest published version ${latest}`,
    }
  }
  return { ok: true, version }
}

/**
 * The registry's node schema with what a custom node may leave out: who
 * wrote it, its licence and its providers (Cloudflare today).
 */
export const customNodeDefinitionSchema = nodeDefinitionSchema.extend({
  author: nodeDefinitionSchema.shape.author.default('custom'),
  license: nodeDefinitionSchema.shape.license.default('UNLICENSED'),
  providers: nodeDefinitionSchema.shape.providers.default(['cloudflare']),
})

/**
 * A custom node's `node.json`, parsed with its defaults filled in, or the
 * reasons it cannot be used. Its `version` must name the folder it sits in.
 */
export function validateCustomNodeManifest(
  source: string,
  folderVersion: string,
  path: string,
): { definition: NodeDefinition; errors: [] } | { definition: null; errors: ValidationError[] } {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { definition: null, errors: [{ path, message: 'node.json must be valid JSON' }] }
  }
  const parsed = customNodeDefinitionSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      definition: null,
      errors: parsed.error.issues.map((issue: z.core.$ZodIssue) => ({
        path: issue.path.length > 0 ? `${path}.${issue.path.join('.')}` : path,
        message: issue.message,
      })),
    }
  }
  if (parsed.data.version !== folderVersion) {
    return {
      definition: null,
      errors: [
        {
          path: `${path}.version`,
          message: `version "${parsed.data.version}" must match its folder ${folderVersion}`,
        },
      ],
    }
  }
  return { definition: parsed.data as NodeDefinition, errors: [] }
}
