import type { ConfigField } from '@awaitstep/ir'
import { compareLibraryVersions, nodeVersionFolder, parsePackageManifest } from '@awaitstep/ir'
import type { ApiLibraryTreeItem } from '../library-api'
import { idePath } from './ide-index'
import { safeConfigSchema } from './node-schema-guard'

export interface ManifestSummary {
  /** The file the summary is read from, as an IDE path. */
  path: string
  rows: { label: string; value: string }[]
  dependencies: { name: string; range: string }[]
  /** A node's settings, for the canvas preview. */
  configSchema: Record<string, ConfigField> | null
}

/** A node's newest folder: its open draft, else the latest published one. */
export function newestNodeFolder(item: ApiLibraryTreeItem): string | null {
  const folders = new Set<string>()
  for (const file of item.files) {
    const folder = nodeVersionFolder(file.path)
    if (folder) folders.add(folder)
  }
  return [...folders].sort(compareLibraryVersions).at(-1) ?? null
}

/**
 * What the Details pane's manifest card shows (28d/28e), read from the
 * item's `package.json`, or its newest folder's `node.json`, as edited.
 * Null while that file's text is not loaded.
 */
export function manifestSummary(
  item: ApiLibraryTreeItem,
  sourceOf: (path: string) => string | undefined,
): ManifestSummary | null {
  if (item.kind === 'module') {
    const path = idePath(item, 'package.json')
    const source = sourceOf(path)
    if (source === undefined) return null
    const manifest = parsePackageManifest(source)
    return {
      path,
      rows: [
        { label: 'Package', value: manifest?.name ?? '—' },
        { label: 'Version', value: manifest?.version ?? '—' },
        { label: 'Import', value: `#modules/${item.slug}` },
      ],
      dependencies: Object.entries(manifest?.dependencies ?? {}).map(([name, range]) => ({
        name,
        range,
      })),
      configSchema: null,
    }
  }
  const folder = newestNodeFolder(item)
  if (!folder) return null
  const path = idePath(item, `${folder}/node.json`)
  const source = sourceOf(path)
  if (source === undefined) return null
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(source) as unknown
    if (value && typeof value === 'object') parsed = value as Record<string, unknown>
  } catch {
    parsed = {}
  }
  const text = (key: string) => (typeof parsed[key] === 'string' ? (parsed[key] as string) : '—')
  const deps = parsed.dependencies
  return {
    path,
    rows: [
      { label: 'Name', value: text('name') },
      { label: 'Version', value: text('version') },
      { label: 'Category', value: text('category') },
    ],
    dependencies:
      deps && typeof deps === 'object' && !Array.isArray(deps)
        ? Object.entries(deps as Record<string, unknown>).map(([name, range]) => ({
            name,
            range: String(range),
          }))
        : [],
    configSchema: safeConfigSchema(parsed.configSchema),
  }
}
