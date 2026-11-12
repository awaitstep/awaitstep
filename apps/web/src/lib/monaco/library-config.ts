import {
  LIBRARY_MODULE_IMPORT_PREFIX,
  compareLibraryVersions,
  isLibraryVersion,
  PACKAGE_MANIFEST_PATH,
  customNodeJsonSchema,
  parsePackageManifest,
} from '@awaitstep/ir'
import type { Monaco } from '@monaco-editor/react'
import { ROOT_DIR } from '../library/ide-index'
import { workflowModelPath } from './setup'

/**
 * A Library's models share the workflows' URI root, so npm declarations
 * (laid under `awaitstep://workflow/node_modules/`) resolve for them too;
 * the `library-` key keeps them apart from any workflow's.
 */
export function libraryModelRoot(owner: { kind: 'workspace' | 'project'; id: string }): string {
  return `library-${owner.kind}-${owner.id}`
}

/** `#modules/<slug>` resolves to `modules/<slug>` (its `index.ts`), as the deploy bundles it. */
export function libraryRootOptions(root: string): {
  baseUrl: string
  paths: Record<string, string[]>
} {
  return {
    baseUrl: workflowModelPath(root, ''),
    paths: {
      [`${LIBRARY_MODULE_IMPORT_PREFIX}*`]: [
        `${ROOT_DIR.module}/*`,
        `${ROOT_DIR.module}/*/index.ts`,
      ],
    },
  }
}

export interface DependencyConflict {
  name: string
  /** Each manifest that declares it, with its range. */
  declared: { path: string; range: string }[]
}

/**
 * Every module's package.json and node's node.json dependencies, merged
 * into one manifest for type acquisition (the first range wins), and the
 * packages two manifests ask for at different ranges: the deploy refuses
 * those, naming both, so the IDE warns first.
 */
export function mergeLibraryDependencies(files: ReadonlyMap<string, { source: string }>): {
  manifest: string
  conflicts: DependencyConflict[]
} {
  const declared = new Map<string, { path: string; range: string }[]>()
  const newestNodeFolders = newestFolders(files.keys())
  for (const [path, file] of files) {
    let deps: Record<string, string> | undefined
    if (path.startsWith(`${ROOT_DIR.module}/`) && path.endsWith(`/${PACKAGE_MANIFEST_PATH}`)) {
      deps = parsePackageManifest(file.source)?.dependencies
    } else if (
      path.startsWith(`${ROOT_DIR.node}/`) &&
      path.endsWith('/node.json') &&
      // Only the version a deploy would take: older folders never bundle together.
      newestNodeFolders.has(path.slice(0, -'/node.json'.length))
    ) {
      try {
        const parsed = JSON.parse(file.source) as { dependencies?: unknown }
        if (parsed && typeof parsed.dependencies === 'object' && parsed.dependencies !== null) {
          deps = parsed.dependencies as Record<string, string>
        }
      } catch {
        deps = undefined
      }
    }
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (typeof range !== 'string') continue
      const list = declared.get(name) ?? []
      list.push({ path, range })
      declared.set(name, list)
    }
  }
  const dependencies: Record<string, string> = {}
  const conflicts: DependencyConflict[] = []
  for (const [name, list] of [...declared].sort(([a], [b]) => a.localeCompare(b))) {
    dependencies[name] = list[0]!.range
    if (new Set(list.map((d) => d.range)).size > 1) conflicts.push({ name, declared: list })
  }
  const manifest = JSON.stringify({ name: 'library', version: '1.0.0', dependencies })
  return { manifest, conflicts }
}

/** Each node's newest version folder (`nodes/<slug>/<version>`) among these paths. */
function newestFolders(paths: Iterable<string>): Set<string> {
  const newest = new Map<string, string>()
  for (const path of paths) {
    const [root, slug, folder] = path.split('/')
    if (root !== ROOT_DIR.node || !slug || !folder || !isLibraryVersion(folder)) continue
    const current = newest.get(slug)
    if (!current || compareLibraryVersions(folder, current) > 0) newest.set(slug, folder)
  }
  return new Set([...newest].map(([slug, folder]) => `${ROOT_DIR.node}/${slug}/${folder}`))
}

/** The files type acquisition reads for a Library: the code, and one merged manifest. */
export function libraryAcquisitionFiles(
  files: ReadonlyMap<string, { source: string }>,
  manifest: string,
): ReadonlyMap<string, { source: string }> {
  const merged = new Map<string, { source: string }>()
  for (const [path, file] of files) {
    if (path.endsWith('.json')) continue
    merged.set(path, file)
  }
  merged.set(PACKAGE_MANIFEST_PATH, { source: manifest })
  return merged
}

let schemaRegistered = false

/** Validates every custom node's node.json against the rules a publish applies (D7). Once per session. */
export function registerNodeJsonSchema(monaco: Monaco): void {
  if (schemaRegistered) return
  schemaRegistered = true
  const json = monaco.languages.json.jsonDefaults
  const current = json.diagnosticsOptions
  json.setDiagnosticsOptions({
    ...current,
    validate: true,
    schemas: [
      ...(current.schemas ?? []),
      {
        uri: 'awaitstep://schemas/custom-node.json',
        fileMatch: [`awaitstep://workflow/library-*/${ROOT_DIR.node}/*/*/node.json`],
        schema: customNodeJsonSchema(),
      },
    ],
  })
}
