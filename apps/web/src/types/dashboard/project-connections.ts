// A project's Cloudflare accounts (23a–23c): the API's own shapes.
export type {
  AvailableConnection,
  AvailableConnectionState,
  DeployConnections,
  ProjectConnection,
  ProjectConnections,
  ProjectConnectionScope,
  ProjectWorkspaceConnection,
} from '@awaitstep/ir'

/** *Connect a new account* (23b). */
export interface NewProjectConnectionInput {
  name: string
  accountId: string
  token: string
  makeDefault: boolean
}
