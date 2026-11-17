import type { ConnectionSummary } from '@awaitstep/ir'
import type { ApiConnectionProjects, OAuthStartBody } from '../../../lib/dashboard-api'
import type { Connection } from '../../../types/dashboard/org-settings'

// Connection rows → the cards on Org Settings › Connections. The API names
// the account by its suffix and the projects by what the reader can see.

export function toConnection(row: ConnectionSummary): Connection {
  return {
    id: row.id,
    name: row.name,
    accountSuffix: row.accountSuffix ?? '',
    addedBy: { id: '', name: row.createdByName ?? 'a former member' },
    authKind: row.authKind ?? 'api-token',
    ...(row.canDeploy !== undefined && { canDeploy: row.canDeploy }),
    tokenStatus: row.tokenStatus,
    tokenExpiresAt: row.tokenExpiresAt,
    projects: row.allProjects ? 'all' : row.projects.map(({ id, name }) => ({ id, name })),
    hiddenProjects: row.hiddenProjects,
    deployments: row.deployments,
  }
}

/** The dialog's and the chips' `'all' | ids` as the API takes it. */
export function toProjectsBody(projects: 'all' | string[]): ApiConnectionProjects {
  return projects === 'all' ? { allProjects: true } : { allProjects: false, projectIds: projects }
}

export interface OAuthStartOptions {
  /** Re-authorize that connection in place instead of adding one. */
  connectionId?: string
  /** Make the account the project's own (or, with a workspace, that workspace's default). */
  project?: string
  workspace?: string
  workspaceId?: string
}

/**
 * The start request for connecting a Cloudflare account. An org connection
 * omits project; a project connection names it; a workspace connection also
 * names the workspace, which becomes its deploy default.
 */
export function oauthStartBody(org: string, options: OAuthStartOptions = {}): OAuthStartBody {
  return {
    org,
    ...(options.project && { project: options.project }),
    ...(options.workspace && { workspace: options.workspace }),
    ...(options.workspaceId && { workspaceId: options.workspaceId }),
    ...(options.connectionId && { connection: options.connectionId }),
  }
}
