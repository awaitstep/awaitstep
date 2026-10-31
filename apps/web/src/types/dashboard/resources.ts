// Dashboard types for the org's Resources page. On the API (B9) the catalog is
// the marketplace's; org-built (custom) nodes exist on dummy data only.

/** Where a node comes from: the public marketplace, or built by the org. */
export type NodeSource = 'marketplace' | 'custom'

/** A node in the org's catalog: installed for every project, or available to install. */
export interface OrgNode {
  id: string
  name: string
  /** The registry's category: "AI", "Data", "Messaging", "Payments"… */
  category: string
  description: string
  /** The installed version, or the latest when not installed: "2.3.0", "4". */
  version: string
  source: NodeSource
  /** Custom nodes only: who built it. */
  author?: string
  /** Custom nodes are always installed. */
  installed: boolean
  /** Workflows that use it; 0 when installed but unused. Absent when not installed. */
  usage?: number
  /** The marketplace's newest version; Update moves `version` to it. */
  latestVersion: string
  updateAvailable: boolean
}
