import { API_BASE } from '../../lib/api-client'

export interface OAuthStartOptions {
  /** Re-authorize that connection in place instead of adding one. */
  connectionId?: string
  /** Make the account the project's own (or, with a workspace, that workspace's default). */
  project?: string
  workspace?: string
  workspaceId?: string
}

/**
 * Where the browser goes to connect a Cloudflare account. An org connection
 * omits project; a project connection names it; a workspace connection also
 * names the workspace, which becomes its deploy default.
 */
export function oauthStartUrl(org: string, options: OAuthStartOptions = {}): string {
  const params = new URLSearchParams({ org })
  if (options.project) params.set('project', options.project)
  if (options.workspace) params.set('workspace', options.workspace)
  if (options.workspaceId) params.set('workspaceId', options.workspaceId)
  if (options.connectionId) params.set('connection', options.connectionId)
  return `${API_BASE}/oauth/cloudflare/start?${params.toString()}`
}
