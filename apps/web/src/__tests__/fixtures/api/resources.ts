import type { ApiMarketplaceNode, ApiResourceCounts } from '../../../lib/dashboard-api'
import type { SeedDb } from '../seed/rows'
import { orgVariables } from './variables'

// Resources: the org's node catalog (`GET /marketplace`) and the tab counts
// (`GET /resources/counts`), projected from the seed.

export function marketplace(seed: SeedDb, orgId: string): ApiMarketplaceNode[] {
  return seed.nodes
    .filter((n) => n.orgId === orgId)
    .map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      category: n.category,
      author:
        n.source === 'custom'
          ? (seed.people.find((p) => p.id === n.authorId)?.name ?? 'Someone')
          : 'AwaitStep',
      latest: n.latestVersion,
      installed: n.installedVersion !== null,
      installedVersion: n.installedVersion,
      usage: n.installedVersion !== null ? n.usage : null,
      inRegistry: true,
    }))
}

export function resourceCounts(seed: SeedDb, orgId: string, now: Date): ApiResourceCounts {
  return {
    installedNodes: seed.nodes.filter((n) => n.orgId === orgId && n.installedVersion !== null)
      .length,
    variables: orgVariables(seed, orgId, now).data.length,
  }
}
