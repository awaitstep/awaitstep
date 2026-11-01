import type { OrgNode } from '../../types/dashboard/resources'

/** The Show pills: everything, what's installed, or what the marketplace still offers. */
export type NodeShow = 'all' | 'installed' | 'available'

/** `All`, or one of the categories the catalog has. */
export type NodeCategory = string

/** The categories the catalog's nodes carry, A to Z (the registry's own list). */
export function nodeCategories(nodes: OrgNode[]): string[] {
  return [...new Set(nodes.map((n) => n.category))].sort((a, b) => a.localeCompare(b))
}

/** The Category select's options: All, then each category, with how many nodes are in it. */
export function categoryOptions(
  nodes: OrgNode[],
): { value: NodeCategory; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const n of nodes) counts.set(n.category, (counts.get(n.category) ?? 0) + 1)
  return [
    { value: 'All', label: 'All', count: nodes.length },
    ...nodeCategories(nodes).map((c) => ({ value: c, label: c, count: counts.get(c) ?? 0 })),
  ]
}

export interface NodeFilter {
  show: NodeShow
  category: NodeCategory
  search: string
}

/** The Show pills' counts: the whole catalog, before category or search (as the board counts). */
export function showCounts(nodes: OrgNode[]): Record<NodeShow, number> {
  const installed = nodes.filter((n) => n.installed).length
  return { all: nodes.length, installed, available: nodes.length - installed }
}

/**
 * The two card sections after the filters. A section the Show pill hides is
 * null, so the page leaves it out rather than saying it's empty.
 */
export function filterNodes(
  nodes: OrgNode[],
  { show, category, search }: NodeFilter,
): { installed: OrgNode[] | null; available: OrgNode[] | null } {
  const term = search.trim().toLowerCase()
  const shown = nodes.filter(
    (n) =>
      (category === 'All' || n.category === category) &&
      (!term || n.name.toLowerCase().includes(term)),
  )
  return {
    installed: show === 'available' ? null : shown.filter((n) => n.installed),
    available: show === 'installed' ? null : shown.filter((n) => !n.installed),
  }
}
