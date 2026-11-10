// Cloudflare connections (B9): which projects an account serves and whether
// its token still works, as the API answers them.

/** `unchecked` until the first check: created before B9, or never reachable. */
export type ConnectionTokenStatus = 'active' | 'invalid' | 'unchecked'

/** A token is re-checked once a day, a bounded number per maintenance tick. */
export const TOKEN_RECHECK_MS = 24 * 60 * 60 * 1000
export const TOKEN_CHECKS_PER_TICK = 20

/** A connection as `GET /connections` lists it. */
export interface ConnectionSummary {
  id: string
  provider: string
  name: string
  /** Null when the person has been removed from the instance. */
  createdByName: string | null
  /** Last four characters of the account id; the only account detail the list carries. */
  accountSuffix: string | null
  /** Serves every project, including ones created later. */
  allProjects: boolean
  /** The projects it serves that the caller can see (empty when `allProjects`). */
  projects: { id: string; name: string; slug: string }[]
  /** How it authenticates: an API token, or an OAuth grant that renews itself. */
  authKind?: 'api-token' | 'oauth'
  /** False when an OAuth grant lacks every Workers deploy scope; API tokens are optimistic. */
  canDeploy?: boolean
  /** Projects it serves that the caller can't see. */
  hiddenProjects: number
  tokenStatus: ConnectionTokenStatus
  /** Null: no expiry, or not known yet. */
  tokenExpiresAt: string | null
  tokenCheckedAt: string | null
  deployments: { count: number; lastAt: string | null }
  createdAt: string
  updatedAt: string
}

/**
 * Whether a listed connection serves the project — what `POST /deploy`
 * holds a new deploy to. Read from the list a person can see: a project
 * they are deploying in is one they can see, so it is named when served.
 */
export function connectionServes(
  connection: Pick<ConnectionSummary, 'allProjects' | 'projects'>,
  projectId: string,
): boolean {
  return connection.allProjects || connection.projects.some((p) => p.id === projectId)
}

/** Whether deploys with a token of this status and expiry can still work at `now`. */
export function tokenUsable(
  status: ConnectionTokenStatus,
  expiresAt: string | null,
  now: Date,
): boolean {
  if (status === 'invalid') return false
  return expiresAt === null || new Date(expiresAt).getTime() > now.getTime()
}

/** What a project has set up, for its empty pages (`GET /projects/:project/setup`). */
export interface ProjectSetup {
  /** A Cloudflare account this project may deploy with, whose token works and hasn't expired. */
  cloudflareConnected: boolean
  /** Org variables the project inherits: those it doesn't set itself. */
  orgVariables: number
  /** Variables the project sets itself. */
  projectVariables: number
  /** Live keys scoped to the project, which reach every workspace in it. */
  projectKeys: number
}

/** Who a project's account belongs to: shared by the organization, or the project's own. */
export type ProjectConnectionScope = 'shared' | 'project'

/** One of the accounts a project deploys to (`GET /projects/:id/connections`, board 23a). */
export interface ProjectConnection {
  id: string
  provider: string
  name: string
  /** Last four characters of the account id. */
  accountSuffix: string | null
  /** Who connected the account; null when they've been removed from the instance. */
  createdByName: string | null
  scope: ProjectConnectionScope
  tokenStatus: ConnectionTokenStatus
  tokenExpiresAt: string | null
  /** How it authenticates: an API token, or an OAuth grant that renews itself. */
  authKind?: 'api-token' | 'oauth'
  /** False when an OAuth grant lacks every Workers deploy scope. */
  canDeploy?: boolean
  isDefault: boolean
  /**
   * False for a shared account an org admin has since restricted to other
   * projects: it stays listed, but Deploy refuses it until it is available again.
   */
  available: boolean
  /** This project's successful deployments with it. */
  deployments: { count: number; lastAt: string | null }
  /** The workspaces whose workflows have deployed with it, by name. */
  deployedFrom: string[]
  addedAt: string
}

/** Where a workspace deploys: its own account, the project default, or nowhere yet. */
export type WorkspaceConnectionSource = 'override' | 'default' | 'none'

/** A row of *Where each workspace deploys*. */
export interface ProjectWorkspaceConnection {
  workspaceId: string
  name: string
  /** The account the workspace deploys to; null when it has none. */
  connectionId: string | null
  connectionName: string | null
  source: WorkspaceConnectionSource
  /** The workspace's latest successful deployment, with any account. */
  lastDeployAt: string | null
}

export interface ProjectConnections {
  connections: ProjectConnection[]
  workspaces: ProjectWorkspaceConnection[]
}

/**
 * An organization account as the project's *Add connection* lists it (23b):
 * already added, available to add, or restricted to other projects.
 */
export type AvailableConnectionState = 'added' | 'available' | 'restricted'

export interface AvailableConnection {
  id: string
  provider: string
  name: string
  accountSuffix: string | null
  tokenStatus: ConnectionTokenStatus
  tokenExpiresAt: string | null
  state: AvailableConnectionState
  /** For a restricted account: the projects it serves that the reader can see, by name. */
  restrictedTo: string[]
}

/**
 * What is live on one account a workflow was deployed with: that account's
 * newest successful deployment.
 */
export interface LiveDeployment {
  /** The account (connection). */
  id: string
  name: string
  deploymentId: string
  /** The worker's URL on that account, when the deploy gave one. */
  serviceUrl: string | null
  /** Null once the version is deleted; `version` still says which it was. */
  versionId: string | null
  version: number | null
  versionLocked: boolean
  deployedAt: string
  deployedByName: string | null
}

/** The accounts Deploy offers for a workflow, with the one already chosen. */
export interface DeployConnections {
  connections: Pick<
    ProjectConnection,
    'id' | 'provider' | 'name' | 'accountSuffix' | 'scope' | 'tokenStatus' | 'tokenExpiresAt'
  >[]
  /** The workflow's workspace's account, else the project default; null when neither is set. */
  defaultId: string | null
  /**
   * What is live on each account the workflow was deployed with, latest first —
   * the only accounts a trigger may name, whether or not the project still has them.
   */
  deployedWith: LiveDeployment[]
}

/** Why a project's connection write was refused, as the API answers it. */
export const PROJECT_CONNECTION_REASONS = {
  notProjects:
    'That account isn’t one of this project’s. Add it on the project’s Connections page.',
  notAvailable:
    'That account isn’t available to this project. Ask an org admin to make it available.',
  ownedOnly:
    'Only an account this project owns can be changed here. Shared accounts are changed in the organization’s Connections.',
  stillDeployed: (workflows: string[], elsewhere = 0) => {
    const total = workflows.length + elsewhere
    const who =
      workflows.length === 1 && elsewhere === 0
        ? `${workflows[0]} is`
        : workflows.length === 0
          ? `${total === 1 ? '1 workflow in another project is' : `${total} workflows in other projects are`}`
          : `${total} workflows are`
    return `${who} still deployed with this account. Take ${total === 1 ? 'it' : 'them'} down first, or the workers keep running with no way to stop them from here.`
  },
  defaultChanged: 'Someone changed the default at the same time. Reload and try again.',
} as const
