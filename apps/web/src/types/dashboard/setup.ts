// Counts for the EmptyProject and EmptyWorkspace boards. Keys and variables
// are counted from their lists (P3); `cloudflareConnected` stays a thin flag
// until P5 brings connections.

/** What a project has set up and what its workspaces inherit. */
export interface ProjectSetup {
  /** The org has connected Cloudflare. */
  cloudflareConnected: boolean
  /** Org variables the project inherits: those it doesn't set itself. */
  orgVariables: number
  /** Variables the project sets itself. */
  projectVariables: number
  /** Keys scoped to the project, which reach every workspace in it. */
  projectKeys: number
}
