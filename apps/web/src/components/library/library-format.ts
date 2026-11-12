import type { ApiLibraryConsumers, ApiLibraryRow, LibraryKind } from '../../lib/library-api'

export const KIND_LABEL: Record<LibraryKind, string> = { module: 'Module', node: 'Custom node' }

/** The short word the tables and pills use. */
export const KIND_PILL: Record<LibraryKind, string> = { module: 'Module', node: 'Node' }

export type KindFilter = 'all' | LibraryKind

export function matchesKind(row: { kind: LibraryKind }, filter: KindFilter): boolean {
  return filter === 'all' || row.kind === filter
}

export function versionLabel(version: string | null): string {
  return version === null ? 'Not published' : `v${version}`
}

export function usedByLabel(count: number): string {
  if (count === 0) return 'Not used yet'
  return count === 1 ? '1 consumer' : `${count} consumers`
}

/** "Lead enrichment, Post to Slack and 1 more you can't open", for the delete and publish dialogs. */
export function consumerNames(consumers: ApiLibraryConsumers): string[] {
  const names = consumers.visible.map((c) => c.name)
  if (consumers.hiddenCount > 0) {
    names.push(
      consumers.hiddenCount === 1
        ? '1 more you can’t open'
        : `${consumers.hiddenCount} more you can’t open`,
    )
  }
  return names
}

/** The path a module is imported by; nodes have none. */
export function importPathOf(row: Pick<ApiLibraryRow, 'kind' | 'slug'>): string | null {
  return row.kind === 'module' ? `#modules/${row.slug}` : null
}
