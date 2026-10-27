// Thin counts for the EmptyProject and EmptyWorkspace boards, until the lists
// they count land: connections (P5), keys (P3/P6) and variables (P4/P6). Each
// P-step that brings a list replaces its count here with that list's length.

/** What a project has set up and what its workspaces inherit. */
export interface ProjectSetup {
  /** The org has connected Cloudflare. */
  cloudflareConnected: boolean
  /** Variables the org sets; every project inherits them. */
  orgVariables: number
  /** Variables the project sets itself. */
  projectVariables: number
  /** Keys scoped to the project, which reach every workspace in it. */
  projectKeys: number
}
