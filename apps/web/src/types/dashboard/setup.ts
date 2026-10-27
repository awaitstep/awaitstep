// Counts for the EmptyProject and EmptyWorkspace boards, from their lists:
// keys and variables (P3), connections (P5).

/** What a project has set up and what its workspaces inherit. */
export interface ProjectSetup {
  /** A Cloudflare account this project may deploy with, with a working token. */
  cloudflareConnected: boolean
  /** Org variables the project inherits: those it doesn't set itself. */
  orgVariables: number
  /** Variables the project sets itself. */
  projectVariables: number
  /** Keys scoped to the project, which reach every workspace in it. */
  projectKeys: number
}
