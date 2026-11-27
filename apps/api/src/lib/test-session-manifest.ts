import { buildFileManifest, type FileManifest } from '@awaitstep/ir'

/**
 * Where a session's stored manifest keeps the hash of the graph it was built
 * from, beside its project files. No project file has this path: a path never
 * starts with `#`.
 */
const GRAPH_KEY = '#graph'

/** What a session was built from, as stored: its project files and its graph. */
export function sessionManifest(
  files: readonly { path: string; hash: string }[],
  graphHash: string,
): FileManifest {
  const manifest = buildFileManifest(files.filter((file) => file.path !== GRAPH_KEY))
  manifest[GRAPH_KEY] = graphHash
  return manifest
}

/**
 * A stored manifest, taken apart. Both null for a session that predates
 * manifests (or holds bad JSON); `graphHash` alone for one that predates it.
 */
export function readSessionManifest(stored: string | null): {
  files: FileManifest | null
  graphHash: string | null
} {
  if (!stored) return { files: null, graphHash: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return { files: null, graphHash: null }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { files: null, graphHash: null }
  }
  const { [GRAPH_KEY]: graph, ...files } = parsed as Record<string, string>
  return { files, graphHash: typeof graph === 'string' ? graph : null }
}
