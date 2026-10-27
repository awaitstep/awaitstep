import type { NODE_CATEGORIES, OrgNode } from '../../types/dashboard/resources'

/** The Show pills: everything, what's installed, or what the marketplace still offers. */
export type NodeShow = 'all' | 'installed' | 'available'

export type NodeCategory = 'All' | (typeof NODE_CATEGORIES)[number]

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
