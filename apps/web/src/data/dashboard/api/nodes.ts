import type { ApiMarketplaceNode } from '../../../lib/dashboard-api'
import type { OrgNode } from '../../../types/dashboard/resources'

// Marketplace entries → the cards on Resources › Nodes. The API has no
// org-built nodes (D-B9-10): every node here is the marketplace's.

export function toOrgNode(node: ApiMarketplaceNode): OrgNode {
  const version = node.installedVersion ?? node.latest
  return {
    id: node.id,
    name: node.name,
    ...(node.icon && { icon: node.icon }),
    category: node.category,
    description: node.description,
    version,
    source: 'marketplace',
    installed: node.installed,
    ...(node.installed && { usage: node.usage ?? 0 }),
    latestVersion: node.latest,
    updateAvailable: node.installed && version !== node.latest,
  }
}
