// Dashboard types for the org's Resources page. Web-only until B9 wires the
// existing marketplace and custom-node APIs.

/** Where a node comes from: the public marketplace, or built by the org. */
export type NodeSource = 'marketplace' | 'custom'

/** A node in the org's catalog: installed for every project, or available to install. */
export interface OrgNode {
  id: string
  name: string
  /** "AI", "Data", "Messaging", "Payments", "Utilities". */
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
  updateAvailable: boolean
}
